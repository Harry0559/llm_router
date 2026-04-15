'use client';

import type { ReactNode } from 'react';
import JsonViewer from './JsonViewer';

interface ContentBlock {
  type: string;
  text?: string | ContentBlock | ContentBlock[];
  id?: string;
  name?: string;
  input?: unknown;
}

interface AnthropicResponse {
  id?: string;
  type?: string;
  role?: string;
  model?: string;
  content?: ContentBlock[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface OpenAIChoice {
  message?: { role?: string; content?: string | null; tool_calls?: unknown[] };
  finish_reason?: string;
}

interface OpenAIResponse {
  id?: string;
  model?: string;
  choices?: OpenAIChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

function AnthropicResponseView({ body, expandDepth = 3 }: { body: AnthropicResponse; expandDepth?: number }) {
  const content = body.content ?? [];
  return (
    <div className="space-y-3">
      {/* Meta */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-400 border-b border-gray-800 pb-2">
        {body.model && <span><span className="text-gray-600">model </span><span className="text-gray-300">{body.model}</span></span>}
        {body.stop_reason && <span><span className="text-gray-600">stop </span><span className="text-gray-300">{body.stop_reason}</span></span>}
        {body.usage && (
          <>
            <span><span className="text-gray-600">in </span><span className="text-yellow-300">{body.usage.input_tokens}</span></span>
            <span><span className="text-gray-600">out </span><span className="text-green-300">{body.usage.output_tokens}</span></span>
          </>
        )}
        {body.id && <span className="ml-auto text-gray-600 text-xs">{body.id}</span>}
      </div>

      {/* Content blocks */}
      {content.map((block, i) => {
        if (block.type === 'text') {
          const t = block.text;
          let body: ReactNode;
          if (typeof t === 'string') {
            body = (
              <pre className="mt-2 text-sm text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
                {t}
              </pre>
            );
          } else {
            body = (
              <div className="mt-2">
                <JsonViewer data={t ?? block} defaultExpand={expandDepth} />
              </div>
            );
          }
          return (
            <div key={i} className="border border-slate-500/40 bg-slate-900/40 rounded-md p-3">
              <span className="text-xs font-bold text-slate-300">ASSISTANT</span>
              {body}
            </div>
          );
        }
        if (block.type === 'tool_use') {
          return (
            <div key={i} className="tool-use-block">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs bg-violet-600 text-white px-2 py-0.5 rounded font-semibold">TOOL USE</span>
                <span className="text-violet-300 font-semibold">{block.name}</span>
                {block.id && <span className="text-gray-500 text-xs ml-auto">{block.id}</span>}
              </div>
              <div className="bg-black/30 rounded p-2">
                <JsonViewer data={block.input} defaultExpand={expandDepth} />
              </div>
            </div>
          );
        }
        return <JsonViewer key={i} data={block} defaultExpand={expandDepth} />;
      })}

      {content.length === 0 && (
        <p className="text-gray-500 text-xs">(empty content)</p>
      )}
    </div>
  );
}

function OpenAIResponseView({ body, expandDepth = 3 }: { body: OpenAIResponse; expandDepth?: number }) {
  const choice = body.choices?.[0];
  const msg = choice?.message;
  const toolCalls = msg?.tool_calls as unknown[] | undefined;

  return (
    <div className="space-y-3">
      {/* Meta */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-400 border-b border-gray-800 pb-2">
        {body.model && <span><span className="text-gray-600">model </span><span className="text-gray-300">{body.model}</span></span>}
        {choice?.finish_reason && <span><span className="text-gray-600">finish </span><span className="text-gray-300">{choice.finish_reason}</span></span>}
        {body.usage && (
          <>
            <span><span className="text-gray-600">prompt </span><span className="text-yellow-300">{body.usage.prompt_tokens}</span></span>
            <span><span className="text-gray-600">completion </span><span className="text-green-300">{body.usage.completion_tokens}</span></span>
          </>
        )}
      </div>

      {/* Content */}
      {msg?.content && (
        <div className="border border-slate-500/40 bg-slate-900/40 rounded-md p-3">
          <span className="text-xs font-bold text-slate-300">ASSISTANT</span>
          <pre className="mt-2 text-sm text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
            {msg.content}
          </pre>
        </div>
      )}

      {/* Tool calls */}
      {toolCalls && toolCalls.map((tc, i) => {
        const t = tc as { id?: string; function?: { name?: string; arguments?: string } };
        let parsedArgs: unknown = t.function?.arguments;
        try { if (typeof parsedArgs === 'string') parsedArgs = JSON.parse(parsedArgs); } catch { /* keep string */ }
        return (
          <div key={i} className="tool-use-block">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-violet-600 text-white px-2 py-0.5 rounded font-semibold">TOOL USE</span>
              <span className="text-violet-300 font-semibold">{t.function?.name}</span>
              {t.id && <span className="text-gray-500 text-xs ml-auto">{t.id}</span>}
            </div>
            <div className="bg-black/30 rounded p-2">
              <JsonViewer data={parsedArgs} defaultExpand={expandDepth} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface ResponseViewerProps {
  responseBody: unknown;
  protocol: string;
  expandDepth?: number;
}

export default function ResponseViewer({ responseBody, protocol, expandDepth = 3 }: ResponseViewerProps) {
  let body: Record<string, unknown>;
  if (typeof responseBody === 'string') {
    try { body = JSON.parse(responseBody) as Record<string, unknown>; }
    catch { return <pre className="text-xs text-gray-400">{responseBody}</pre>; }
  } else {
    body = responseBody as Record<string, unknown>;
  }

  if (protocol === 'anthropic') {
    return <AnthropicResponseView body={body as AnthropicResponse} expandDepth={expandDepth} />;
  }
  return <OpenAIResponseView body={body as OpenAIResponse} expandDepth={expandDepth} />;
}
