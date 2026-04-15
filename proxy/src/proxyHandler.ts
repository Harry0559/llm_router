import express, { type Request, type Response } from 'express';
import axios, { type AxiosResponse } from 'axios';
import cors from 'cors';
import { UPSTREAM_URL, PROXY_PORT } from './config';
import { resolveSession, resolveRun, insertTrace } from './db';
import { broadcast } from './broadcast';
import {
  assembleAnthropicStream, getAnthropicTokens,
  assembleOpenAIStream, getOpenAITokens,
} from './streamAssembler';

// Strip HTTP hop-by-hop headers that must not be forwarded
const STRIP_HEADERS = new Set([
  'host', 'content-length', 'connection',
]);

// ────────── session / run signal extraction ──────────

/**
 * Read metadata.user_id (JSON string) → parse → return session_id field.
 * Falls back to "__unknown__" if the field is absent or malformed.
 */
function extractExternalSessionId(body: Record<string, unknown>): string {
  try {
    const metadata = (body.metadata ?? {}) as Record<string, unknown>;
    const raw = metadata.user_id as string | undefined;
    if (!raw) return '__unknown__';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const sid = parsed.session_id as string | undefined;
    return sid || '__unknown__';
  } catch {
    return '__unknown__';
  }
}

export type AgentType = 'main_agent' | 'subagent' | 'title_gen';

/**
 * Classify the caller based on the tools array:
 *   - no tools           → title_gen  (CC title-generation call)
 *   - tools includes     → main_agent (only main agent holds the Agent tool)
 *     name === 'Agent'
 *   - tools but no Agent → subagent
 */
function classifyAgentType(body: Record<string, unknown>): AgentType {
  const tools = body.tools as { name: string }[] | undefined;
  if (!tools || tools.length === 0) return 'title_gen';
  if (tools.some(t => t.name === 'Agent')) return 'main_agent';
  return 'subagent';
}

/**
 * A new run starts only when the main agent receives a fresh user message
 * (last message role=user with all-text content, no tool_result).
 * Subagent and title_gen traces never open a new run.
 */
function isNewRunStart(body: Record<string, unknown>, agentType: AgentType): boolean {
  if (agentType !== 'main_agent') return false;

  const messages = body.messages as unknown[] | undefined;
  if (!messages || messages.length === 0) return true;

  const last = messages[messages.length - 1] as Record<string, unknown>;
  if (last.role !== 'user') return false;

  const content = last.content;
  if (typeof content === 'string') return true;
  if (!Array.isArray(content) || content.length === 0) return false;

  return (content as Record<string, unknown>[]).every(item => item.type === 'text');
}

// ────────── request helpers ──────────

function buildRequestHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  for (const [key, value] of Object.entries(req.headers)) {
    if (!STRIP_HEADERS.has(key) && typeof value === 'string') {
      headers[key] = value;
    }
  }
  return headers;
}

// ────────── core proxy handler ──────────

async function handleProxy(req: Request, res: Response, protocol: 'anthropic' | 'openai'): Promise<void> {
  const startTime = Date.now();

  const requestBody = req.body as Record<string, unknown>;
  const externalId  = extractExternalSessionId(requestBody);
  const sessionId   = resolveSession(externalId);
  const agentType   = classifyAgentType(requestBody);
  const isNew       = isNewRunStart(requestBody, agentType);
  const runId       = resolveRun(sessionId, isNew);

  const isStreaming    = requestBody.stream === true;
  const upstreamHeaders = buildRequestHeaders(req);
  const upstreamUrl    = `${UPSTREAM_URL.replace(/\/$/, '')}${req.path}`;

  const sanitizedReqHeaders = Object.fromEntries(
    Object.entries(req.headers).filter(([k]) => !STRIP_HEADERS.has(k))
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let upstreamResp!: AxiosResponse<any, any>;
  try {
    upstreamResp = await axios({
      method: 'POST',
      url: upstreamUrl,
      headers: upstreamHeaders,
      data: requestBody,
      responseType: isStreaming ? 'stream' : 'json',
      timeout: 180_000,
    });
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status: number; data: unknown; headers: unknown }; message: string };
    const status = axiosErr.response?.status ?? 502;
    const rawData = axiosErr.response?.data;
    let body: unknown;
    try {
      JSON.stringify(rawData);
      body = rawData ?? { error: axiosErr.message };
    } catch {
      body = { error: axiosErr.message };
    }

    if (!res.headersSent) res.status(status).json(body);

    const duration = Date.now() - startTime;
    const model    = (requestBody.model as string) || '';
    const traceId  = insertTrace({
      session_id: sessionId, run_id: runId, agent_type: agentType, agent: protocol, port: PROXY_PORT, protocol,
      timestamp: startTime, request_method: req.method, request_path: req.path,
      request_headers: JSON.stringify(sanitizedReqHeaders),
      request_body: JSON.stringify(requestBody),
      response_status: status,
      response_headers: JSON.stringify(axiosErr.response?.headers ?? {}),
      response_body: JSON.stringify(body),
      duration_ms: duration, model, tokens_input: 0, tokens_output: 0,
    });
    broadcast('new_trace', { id: traceId, session_id: sessionId, run_id: runId, agent: protocol, timestamp: startTime, response_status: status, duration_ms: duration });
    return;
  }

  if (isStreaming) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.status(upstreamResp.status);

    const chunks: Buffer[] = [];
    let clientAlive = true;
    req.on('close', () => { clientAlive = false; });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = upstreamResp.data as any;

    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      if (clientAlive) {
        try { res.write(chunk); } catch { clientAlive = false; }
      }
    });

    stream.on('end', () => {
      if (clientAlive) {
        try { res.end(); } catch { /* ignore */ }
      }

      const fullText = Buffer.concat(chunks).toString('utf8');
      const assembled = protocol === 'anthropic'
        ? assembleAnthropicStream(fullText)
        : assembleOpenAIStream(fullText);
      const tokens = protocol === 'anthropic'
        ? getAnthropicTokens(assembled)
        : getOpenAITokens(assembled);
      const model    = (assembled.model as string) || (requestBody.model as string) || '';
      const duration = Date.now() - startTime;

      const traceId = insertTrace({
        session_id: sessionId, run_id: runId, agent_type: agentType, agent: protocol, port: PROXY_PORT, protocol,
        timestamp: startTime, request_method: req.method, request_path: req.path,
        request_headers: JSON.stringify(sanitizedReqHeaders),
        request_body: JSON.stringify(requestBody),
        response_status: upstreamResp.status,
        response_headers: JSON.stringify(upstreamResp.headers),
        response_body: JSON.stringify(assembled),
        duration_ms: duration, model,
        tokens_input: tokens.input, tokens_output: tokens.output,
      });

      broadcast('new_trace', {
        id: traceId, session_id: sessionId, run_id: runId, agent: protocol,
        timestamp: startTime, response_status: upstreamResp.status,
        duration_ms: duration, model, tokens_input: tokens.input, tokens_output: tokens.output,
      });
    });

    stream.on('error', (err: Error) => {
      console.error(`[${protocol}] stream error:`, err.message);
      if (clientAlive) { try { res.end(); } catch { /* ignore */ } }
    });

  } else {
    const responseBody = upstreamResp.data as Record<string, unknown>;
    res.status(upstreamResp.status).json(responseBody);

    const duration = Date.now() - startTime;
    let tokensIn = 0, tokensOut = 0;
    let model = (requestBody.model as string) || '';

    if (protocol === 'anthropic') {
      const usage = (responseBody.usage ?? {}) as Record<string, number>;
      tokensIn = (usage.input_tokens ?? 0)
        + (usage.cache_creation_input_tokens ?? 0)
        + (usage.cache_read_input_tokens ?? 0);
      tokensOut = usage.output_tokens ?? 0;
      model = (responseBody.model as string) || model;
    } else {
      const usage = (responseBody.usage ?? {}) as Record<string, number>;
      tokensIn = usage.prompt_tokens ?? 0;
      tokensOut = usage.completion_tokens ?? 0;
      model = (responseBody.model as string) || model;
    }

    const traceId = insertTrace({
      session_id: sessionId, run_id: runId, agent_type: agentType, agent: protocol, port: PROXY_PORT, protocol,
      timestamp: startTime, request_method: req.method, request_path: req.path,
      request_headers: JSON.stringify(sanitizedReqHeaders),
      request_body: JSON.stringify(requestBody),
      response_status: upstreamResp.status,
      response_headers: JSON.stringify(upstreamResp.headers),
      response_body: JSON.stringify(responseBody),
      duration_ms: duration, model, tokens_input: tokensIn, tokens_output: tokensOut,
    });

    broadcast('new_trace', {
      id: traceId, session_id: sessionId, run_id: runId, agent: protocol,
      timestamp: startTime, response_status: upstreamResp.status,
      duration_ms: duration, model, tokens_input: tokensIn, tokens_output: tokensOut,
    });
  }
}

export function createProxyApp(): express.Application {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  app.get('/v1/models', (_req, res) => {
    res.json({ object: 'list', data: [] });
  });

  app.post('/v1/messages',         (req, res) => { void handleProxy(req, res, 'anthropic'); });
  app.post('/v1/chat/completions', (req, res) => { void handleProxy(req, res, 'openai'); });

  // Transparent fallback for any other routes
  app.all('*', async (req, res) => {
    const base = UPSTREAM_URL.replace(/\/$/, '');
    const headers = buildRequestHeaders(req);
    try {
      const resp = await axios({ method: req.method as string, url: `${base}${req.path}`, headers, data: req.body, timeout: 30_000 });
      res.status(resp.status).json(resp.data);
    } catch (err: unknown) {
      const e = err as { response?: { status: number; data: unknown }; message: string };
      res.status(e.response?.status ?? 502).json(e.response?.data ?? { error: e.message });
    }
  });

  return app;
}
