import type { TraceDetail } from '@/lib/types';
import { AGENT_LABELS } from '@/lib/types';

/**
 * OpenAI Chat Completions–style message objects (same shape as fine-tuning / eval JSONL lines).
 * @see https://platform.openai.com/docs/api-reference/chat/create
 */
export type OpenAIStyleChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'developer';
  content?: string | null;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

export type TraceMessagesExport = {
  /** Industry-standard chat transcript */
  messages: OpenAIStyleChatMessage[];
  /** Full trace context (not part of OpenAI API, useful for provenance) */
  metadata: {
    trace_id: string;
    session_id: string;
    agent: string;
    agent_label?: string;
    protocol: string;
    timestamp: number;
    timestamp_iso: string;
    duration_ms: number;
    model: string;
    tokens: { input: number; output: number };
    http: { method: string; path: string; status: number };
  };
};

type Json = Record<string, unknown>;

function parseJsonField(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function stringifyToolArgs(input: unknown): string {
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input ?? {});
  } catch {
    return String(input);
  }
}

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

type AnthropicBlock = {
  type: string;
  text?: unknown;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
};

function extractAnthropicTextFromBlock(b: AnthropicBlock): string {
  const t = b.text;
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) {
    return t
      .map((x) => {
        if (isObj(x) && typeof x.type === 'string' && x.type === 'text' && typeof x.text === 'string') {
          return x.text;
        }
        try {
          return JSON.stringify(x);
        } catch {
          return String(x);
        }
      })
      .join('');
  }
  if (t != null && typeof t === 'object') {
    try {
      return JSON.stringify(t);
    } catch {
      return String(t);
    }
  }
  return '';
}

function normalizeSystemToMessage(system: unknown): OpenAIStyleChatMessage | null {
  if (system == null || system === '') return null;
  if (typeof system === 'string') {
    return { role: 'system', content: system };
  }
  if (Array.isArray(system)) {
    const parts = (system as AnthropicBlock[]).map((b) => {
      if (isObj(b) && b.type === 'text') return extractAnthropicTextFromBlock(b as AnthropicBlock);
      try {
        return JSON.stringify(b);
      } catch {
        return String(b);
      }
    });
    const joined = parts.filter(Boolean).join('\n');
    return joined ? { role: 'system', content: joined } : null;
  }
  if (isObj(system) && typeof (system as AnthropicBlock).type === 'string') {
    const s = system as AnthropicBlock;
    if (s.type === 'text') {
      const t = extractAnthropicTextFromBlock(s);
      return t ? { role: 'system', content: t } : null;
    }
  }
  try {
    return { role: 'system', content: JSON.stringify(system) };
  } catch {
    return { role: 'system', content: String(system) };
  }
}

function anthropicContentBlocksToOpenAI(role: string, blocks: AnthropicBlock[]): OpenAIStyleChatMessage[] {
  const out: OpenAIStyleChatMessage[] = [];
  if (role === 'assistant') {
    let text = '';
    const tool_calls: NonNullable<OpenAIStyleChatMessage['tool_calls']> = [];
    for (const b of blocks) {
      if (b.type === 'text') text += extractAnthropicTextFromBlock(b);
      else if (b.type === 'tool_use') {
        tool_calls.push({
          id: (b.id as string) ?? `call_${tool_calls.length}`,
          type: 'function',
          function: { name: (b.name as string) ?? 'unknown_tool', arguments: stringifyToolArgs(b.input) },
        });
      }
    }
    const msg: OpenAIStyleChatMessage = {
      role: 'assistant',
      content: text.length > 0 ? text : tool_calls.length > 0 ? null : '',
    };
    if (tool_calls.length > 0) msg.tool_calls = tool_calls;
    out.push(msg);
    return out;
  }
  if (role === 'user') {
    const textBuf: string[] = [];
    for (const b of blocks) {
      if (b.type === 'text') {
        textBuf.push(extractAnthropicTextFromBlock(b));
      } else if (b.type === 'tool_result') {
        if (textBuf.length > 0) {
          out.push({ role: 'user', content: textBuf.join('\n') });
          textBuf.length = 0;
        }
        const c =
          typeof b.content === 'string' ? b.content : (() => { try { return JSON.stringify(b.content ?? ''); } catch { return ''; } })();
        out.push({ role: 'tool', tool_call_id: String(b.tool_use_id ?? ''), content: c });
      }
    }
    if (textBuf.length > 0) out.push({ role: 'user', content: textBuf.join('\n') });
    return out;
  }
  return [{ role: 'user', content: JSON.stringify(blocks) }];
}

function normalizeAnthropicRequestMessage(msg: Json): OpenAIStyleChatMessage[] {
  const role = typeof msg.role === 'string' ? msg.role : 'user';
  const content = msg.content;
  if (typeof content === 'string') {
    return [{ role: role === 'assistant' ? 'assistant' : 'user', content }];
  }
  if (Array.isArray(content)) {
    return anthropicContentBlocksToOpenAI(role, content as AnthropicBlock[]);
  }
  if (content != null && isObj(content) && typeof (content as AnthropicBlock).type === 'string') {
    return anthropicContentBlocksToOpenAI(role, [content as AnthropicBlock]);
  }
  try {
    return [{ role: role === 'assistant' ? 'assistant' : 'user', content: JSON.stringify(content) }];
  } catch {
    return [{ role: 'user', content: String(content) }];
  }
}

function normalizeOpenAIRequestMessage(msg: Json): OpenAIStyleChatMessage | null {
  const role = msg.role;
  if (role !== 'system' && role !== 'user' && role !== 'assistant' && role !== 'tool' && role !== 'developer') {
    return null;
  }
  const out: OpenAIStyleChatMessage = { role: role as OpenAIStyleChatMessage['role'] };
  if (typeof msg.name === 'string') out.name = msg.name;
  if (msg.content !== undefined) {
    if (msg.content === null || typeof msg.content === 'string') out.content = msg.content as string | null;
    else {
      try {
        out.content = JSON.stringify(msg.content);
      } catch {
        out.content = String(msg.content);
      }
    }
  } else if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0 && role === 'assistant') {
    out.content = null;
  }
  if (role === 'tool' && typeof msg.tool_call_id === 'string') out.tool_call_id = msg.tool_call_id;
  if (Array.isArray(msg.tool_calls)) {
    out.tool_calls = (msg.tool_calls as Json[]).map((tc, i) => {
      const id = typeof tc.id === 'string' ? tc.id : `call_${i}`;
      const fn = isObj(tc.function) ? tc.function : {};
      const name = typeof fn.name === 'string' ? fn.name : 'unknown';
      let args = fn.arguments;
      if (typeof args !== 'string') args = stringifyToolArgs(args);
      return { id, type: 'function' as const, function: { name, arguments: args as string } };
    });
  }
  return out;
}

function responseToAssistantMessage(protocol: string, body: unknown): OpenAIStyleChatMessage | null {
  if (!isObj(body)) return null;
  if ('error' in body && body.error != null && !('choices' in body) && !('content' in body)) {
    return null;
  }
  if (protocol === 'anthropic') {
    const content = body.content;
    if (!Array.isArray(content) || content.length === 0) return null;
    const msgs = anthropicContentBlocksToOpenAI('assistant', content as AnthropicBlock[]);
    return msgs[0] ?? null;
  }
  const choices = body.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const choice = choices[0] as Json;
  const message = choice.message;
  if (!isObj(message)) return null;
  return normalizeOpenAIRequestMessage({ ...message, role: (message.role as string) ?? 'assistant' });
}

function buildMessagesFromRequest(protocol: string, req: Json): OpenAIStyleChatMessage[] {
  const messages: OpenAIStyleChatMessage[] = [];
  if (protocol === 'anthropic') {
    const sys = normalizeSystemToMessage(req.system);
    if (sys) messages.push(sys);
    const arr = req.messages;
    if (Array.isArray(arr)) {
      for (const m of arr) {
        if (isObj(m)) messages.push(...normalizeAnthropicRequestMessage(m));
      }
    }
    return messages;
  }
  const arr = req.messages;
  if (Array.isArray(arr)) {
    for (const m of arr) {
      if (!isObj(m)) continue;
      const n = normalizeOpenAIRequestMessage(m);
      if (n) messages.push(n);
    }
  }
  return messages;
}

/** Build a single JSON object: OpenAI-style `messages` plus trace metadata. */
export function buildTraceMessagesExport(trace: TraceDetail): TraceMessagesExport {
  const reqParsed = parseJsonField(trace.request_body);
  const resParsed = parseJsonField(trace.response_body);
  const req = isObj(reqParsed) ? reqParsed : {};

  const messages = buildMessagesFromRequest(trace.protocol, req);
  const assistant = responseToAssistantMessage(trace.protocol, resParsed);
  if (assistant) messages.push(assistant);

  const label = AGENT_LABELS[trace.agent];
  return {
    messages,
    metadata: {
      trace_id: trace.id,
      session_id: trace.session_id,
      agent: trace.agent,
      ...(label ? { agent_label: label } : {}),
      protocol: trace.protocol,
      timestamp: trace.timestamp,
      timestamp_iso: new Date(trace.timestamp).toISOString(),
      duration_ms: trace.duration_ms,
      model: trace.model,
      tokens: { input: trace.tokens_input ?? 0, output: trace.tokens_output ?? 0 },
      http: {
        method: trace.request_method,
        path: trace.request_path,
        status: trace.response_status,
      },
    },
  };
}

export function traceExportToJson(exportObj: TraceMessagesExport, pretty = true): string {
  return JSON.stringify(exportObj, null, pretty ? 2 : undefined);
}

export function downloadJsonFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
