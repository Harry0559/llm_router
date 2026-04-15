'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import JsonViewer from './JsonViewer';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContentBlock {
  type: string;
  /** Plain string, nested segment array, or single nested block (API variants). */
  text?: string | ContentBlock | ContentBlock[];
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string | ContentBlock[];
  source?: unknown;
}

interface Message {
  role: string;
  content: string | ContentBlock | ContentBlock[];
}

function isContentBlock(v: unknown): v is ContentBlock {
  return typeof v === 'object' && v !== null && 'type' in v && typeof (v as ContentBlock).type === 'string';
}

// ─── Role styles ─────────────────────────────────────────────────────────────

const ROLE_STYLE: Record<string, string> = {
  user:      'border-blue-500/40 bg-blue-950/30',
  assistant: 'border-slate-500/40 bg-slate-900/40',
  system:    'border-amber-500/40 bg-amber-950/20',
  tool:      'border-violet-500/40 bg-violet-950/20',
};

const ROLE_LABEL: Record<string, string> = {
  user:      'USER',
  assistant: 'ASSISTANT',
  system:    'SYSTEM',
};

const ROLE_COLOR: Record<string, string> = {
  user:      'text-blue-400',
  assistant: 'text-slate-300',
  system:    'text-amber-400',
};

// ─── Tool Use Block ───────────────────────────────────────────────────────────

function ToolUseBlock({ block, initialOpen = false, expandDepth }: {
  block: ContentBlock; initialOpen?: boolean; expandDepth: number;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div className="tool-use-block">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs bg-violet-600 text-white px-2 py-0.5 rounded font-semibold">TOOL USE</span>
        <span className="text-violet-300 font-semibold">{block.name}</span>
        {block.id && <span className="text-gray-500 text-xs ml-auto">{block.id}</span>}
      </div>
      {block.input !== undefined && (
        <div>
          <button
            onClick={() => setOpen(o => !o)}
            className="text-xs text-violet-400 hover:text-violet-200 flex items-center gap-1 mb-1"
          >
            <span>{open ? '▾' : '▸'}</span>
            <span>input</span>
          </button>
          {open && (
            <div className="bg-black/30 rounded p-2">
              <JsonViewer data={block.input} defaultExpand={expandDepth} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tool Result Block ────────────────────────────────────────────────────────

function ToolResultBlock({ block, initialOpen = false, expandDepth }: {
  block: ContentBlock; initialOpen?: boolean; expandDepth: number;
}) {
  const [open, setOpen] = useState(initialOpen);
  const content = block.content;
  const preview = typeof content === 'string'
    ? content.slice(0, 120) + (content.length > 120 ? '…' : '')
    : '[structured content]';

  return (
    <div className="tool-result-block">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs bg-purple-700 text-white px-2 py-0.5 rounded font-semibold">TOOL RESULT</span>
        {block.tool_use_id && <span className="text-gray-500 text-xs">{block.tool_use_id}</span>}
      </div>
      <div>
        {!open && (
          <p className="text-gray-400 text-xs cursor-pointer hover:text-gray-200" onClick={() => setOpen(true)}>
            {preview}
          </p>
        )}
        {open && (
          <div className="bg-black/30 rounded p-2">
            {typeof content === 'string'
              ? <pre className="text-xs text-gray-300 whitespace-pre-wrap break-all">{content}</pre>
              : <JsonViewer data={content} defaultExpand={expandDepth} />
            }
          </div>
        )}
        <button
          onClick={() => setOpen(o => !o)}
          className="text-xs text-purple-400 hover:text-purple-200 mt-1"
        >
          {open ? '▴ collapse' : '▾ expand'}
        </button>
      </div>
    </div>
  );
}

// ─── Content Block renderer ───────────────────────────────────────────────────

function ContentBlockView({ block, blockOpen, expandDepth }: {
  block: ContentBlock; blockOpen?: boolean; expandDepth: number;
}) {
  if (block.type === 'tool_use') return <ToolUseBlock block={block} initialOpen={blockOpen} expandDepth={expandDepth} />;
  if (block.type === 'tool_result') return <ToolResultBlock block={block} initialOpen={blockOpen} expandDepth={expandDepth} />;
  if (block.type === 'text') {
    const t = block.text;
    if (typeof t === 'string') {
      return (
        <pre className="text-sm text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
          {t}
        </pre>
      );
    }
    if (Array.isArray(t)) {
      return (
        <div className="space-y-2">
          {t.map((item, i) =>
            isContentBlock(item) ? (
              <ContentBlockView key={i} block={item} blockOpen={blockOpen} expandDepth={expandDepth} />
            ) : (
              <JsonViewer key={i} data={item} defaultExpand={expandDepth} />
            ),
          )}
        </div>
      );
    }
    if (t != null && typeof t === 'object') {
      if (isContentBlock(t)) return <ContentBlockView block={t} blockOpen={blockOpen} expandDepth={expandDepth} />;
      return <JsonViewer data={t} defaultExpand={expandDepth} />;
    }
    return <JsonViewer data={block} defaultExpand={expandDepth} />;
  }
  // Fallback: show as JSON
  return <JsonViewer data={block} defaultExpand={expandDepth} />;
}

/** Anthropic `system` may be string, a single block, or block[]. */
function renderSystemContent(system: unknown, expandDepth: number): ReactNode {
  if (system == null || system === '') return null;
  if (typeof system === 'string') {
    return (
      <pre className="mt-2 text-sm text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
        {system}
      </pre>
    );
  }
  if (Array.isArray(system)) {
    return (
      <div className="mt-2 space-y-2">
        {system.map((item, i) =>
          isContentBlock(item) ? (
            <ContentBlockView key={i} block={item} expandDepth={expandDepth} />
          ) : (
            <JsonViewer key={i} data={item} defaultExpand={expandDepth} />
          ),
        )}
      </div>
    );
  }
  if (isContentBlock(system)) {
    return (
      <div className="mt-2">
        <ContentBlockView block={system} expandDepth={expandDepth} />
      </div>
    );
  }
  return (
    <div className="mt-2">
      <JsonViewer data={system} defaultExpand={expandDepth} />
    </div>
  );
}

// ─── Single Message ───────────────────────────────────────────────────────────

function MessageCard({ msg, index, blockOpen, expandDepth }: {
  msg: Message; index: number; blockOpen?: boolean; expandDepth: number;
}) {
  const style = ROLE_STYLE[msg.role] ?? 'border-gray-500/40 bg-gray-900/40';
  const labelColor = ROLE_COLOR[msg.role] ?? 'text-gray-400';
  const label = ROLE_LABEL[msg.role] ?? msg.role.toUpperCase();

  const content = msg.content;

  return (
    <div className={`border rounded-md p-3 mb-2 ${style}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-bold ${labelColor}`}>{label}</span>
        <span className="text-gray-600 text-xs">#{index}</span>
      </div>

      {typeof content === 'string' ? (
        <pre className="text-sm text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
          {content}
        </pre>
      ) : Array.isArray(content) ? (
        <div>
          {content.map((block, i) => (
            <ContentBlockView key={i} block={block as ContentBlock} blockOpen={blockOpen} expandDepth={expandDepth} />
          ))}
        </div>
      ) : isContentBlock(content) ? (
        <ContentBlockView block={content} blockOpen={blockOpen} expandDepth={expandDepth} />
      ) : (
        <JsonViewer data={content} defaultExpand={expandDepth} />
      )}
    </div>
  );
}

// ─── Main MessageViewer ───────────────────────────────────────────────────────

interface MessageViewerProps {
  requestBody: unknown;
  protocol: string;
  expandOverride?: 'collapsed' | 'default' | 'expanded';
}

export default function MessageViewer({ requestBody, protocol, expandOverride = 'default' }: MessageViewerProps) {
  const parsed = useMemo(() => {
    if (typeof requestBody === 'string') {
      try {
        return { ok: true as const, body: JSON.parse(requestBody) as Record<string, unknown> };
      } catch {
        return { ok: false as const, raw: requestBody };
      }
    }
    return { ok: true as const, body: requestBody as Record<string, unknown> };
  }, [requestBody]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (!parsed.ok) {
      console.warn('[MessageViewer] JSON parse failed, raw string:', parsed.raw);
      return;
    }
    const body = parsed.body;
    console.log('[MessageViewer] full request_body (JSON)\n', JSON.stringify(body, null, 2));
    console.log('[MessageViewer] full request_body (object)', body);
    if (body.system !== undefined) {
      console.log('[MessageViewer] system', body.system);
    }
    const msgs = body.messages;
    if (Array.isArray(msgs)) {
      msgs.forEach((msg, i) => {
        console.log(`[MessageViewer] messages[${i}]`, msg);
      });
    } else if (msgs !== undefined) {
      console.log('[MessageViewer] messages (non-array)', msgs);
    }
  }, [parsed]);

  const expandDepth = expandOverride === 'collapsed' ? 1 : expandOverride === 'default' ? 3 : 999;
  const blockOpen = expandOverride === 'expanded';
  const [toolsOpen, setToolsOpen] = useState(blockOpen);

  if (!parsed.ok) {
    return <pre className="text-xs text-gray-400">{parsed.raw}</pre>;
  }

  const body = parsed.body;
  const messages = (body.messages ?? []) as Message[];
  const tools = body.tools as unknown[] | undefined;
  const model = body.model as string | undefined;
  const maxTokens = body.max_tokens as number | undefined;

  return (
    <div className="space-y-3">
      {/* Meta bar */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-400 border-b border-gray-800 pb-2">
        {model && <span><span className="text-gray-600">model </span><span className="text-gray-300">{model}</span></span>}
        {maxTokens && <span><span className="text-gray-600">max_tokens </span><span className="text-gray-300">{maxTokens}</span></span>}
        {protocol && <span><span className="text-gray-600">protocol </span><span className="text-gray-300">{protocol}</span></span>}
        {tools && <span><span className="text-gray-600">tools </span><span className="text-gray-300">{(tools as unknown[]).length}</span></span>}
      </div>

      {/* System prompt (string | block | block[] per Anthropic API) */}
      {body.system != null && body.system !== '' && (
        <div className="border border-amber-500/40 bg-amber-950/20 rounded-md p-3">
          <span className="text-xs font-bold text-amber-400">SYSTEM</span>
          {renderSystemContent(body.system, expandDepth)}
        </div>
      )}

      {/* Messages */}
      {messages.map((msg, i) => (
        <MessageCard key={i} msg={msg} index={i} blockOpen={blockOpen} expandDepth={expandDepth} />
      ))}

      {/* Tools definition (collapsible) */}
      {tools && tools.length > 0 && (
        <div className="border border-gray-700 rounded-md">
          <button
            type="button"
            onClick={() => setToolsOpen(o => !o)}
            className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1"
          >
            <span className="text-xs leading-none">{toolsOpen ? '▾' : '▸'}</span>
            Tools definition ({tools.length})
          </button>
          {toolsOpen && (
            <div className="p-3 bg-black/20">
              <JsonViewer data={tools} defaultExpand={expandDepth} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
