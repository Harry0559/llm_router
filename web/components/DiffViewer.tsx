'use client';

import { useState } from 'react';
import type { TraceDetail } from '@/lib/types';

// ── message helpers ──────────────────────────────────────────────────────────

interface Msg { role: string; content: unknown }

function stripCacheControl(content: unknown): unknown {
  if (!Array.isArray(content)) return content;
  return (content as Record<string, unknown>[]).map(({ cache_control: _cc, ...rest }) => rest);
}

function msgKey(m: Msg): string {
  return m.role + '|' + JSON.stringify(stripCacheControl(m.content));
}

function parseMessages(requestBody: string): Msg[] | null {
  try {
    const body = JSON.parse(requestBody) as Record<string, unknown>;
    const msgs = body.messages;
    return Array.isArray(msgs) ? (msgs as Msg[]) : null;
  } catch { return null; }
}

function previewContent(content: unknown): string {
  if (typeof content === 'string') return content.slice(0, 120);
  if (Array.isArray(content)) {
    return (content as Record<string, unknown>[]).map(b => {
      if (b.type === 'text')        return ((b.text as string) ?? '').slice(0, 60);
      if (b.type === 'tool_use')    return `[tool_use: ${b.name as string}]`;
      if (b.type === 'tool_result') return '[tool_result]';
      return `[${b.type as string}]`;
    }).join(' · ').slice(0, 120);
  }
  return JSON.stringify(content).slice(0, 120);
}

// ── LCS ──────────────────────────────────────────────────────────────────────

function computeLCS(a: string[], b: string[]): { inA: Set<number>; inB: Set<number> } {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);

  const inA = new Set<number>(), inB = new Set<number>();
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i-1] === b[j-1])            { inA.add(i-1); inB.add(j-1); i--; j--; }
    else if (dp[i-1][j] >= dp[i][j-1]) i--;
    else                               j--;
  }
  return { inA, inB };
}

// ── sub-components ────────────────────────────────────────────────────────────

function MsgItem({ msg, prefix, colorCls, bgCls }: {
  msg: Msg; prefix: string; colorCls: string; bgCls: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const preview = previewContent(msg.content);
  return (
    <button
      type="button"
      onClick={() => setExpanded(v => !v)}
      className={`w-full text-left px-3 py-2 rounded mb-1 ${bgCls} hover:opacity-90 transition-opacity`}
    >
      <div className="flex items-start gap-2">
        <span className={`text-xs font-bold shrink-0 mt-0.5 w-3 ${colorCls}`}>{prefix}</span>
        <span className={`text-xs font-semibold shrink-0 w-10 ${colorCls}`}>{msg.role}</span>
        <span className="text-xs text-gray-300 break-all whitespace-pre-wrap">
          {expanded
            ? JSON.stringify(msg.content, null, 2)
            : preview + (preview.length >= 120 ? '…' : '')}
        </span>
      </div>
    </button>
  );
}

function Section({ title, count, colorCls, borderCls, defaultOpen, empty, children }: {
  title: string; count: number; colorCls: string; borderCls: string;
  defaultOpen: boolean; empty: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`border-l-2 ${borderCls} pl-3 mb-4`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 mb-2 text-xs font-semibold ${colorCls} hover:opacity-80`}
      >
        <span>{open ? '▼' : '▶'}</span>
        <span>{title}（{count} 条）</span>
      </button>
      {open && (count === 0
        ? <p className="text-gray-600 text-xs pl-1">{empty}</p>
        : <div>{children}</div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function DiffViewer({ traceA, traceB }: { traceA: TraceDetail; traceB: TraceDetail }) {
  if (traceA.id === traceB.id) {
    return <p className="text-gray-500 text-sm p-2">请选择不同的 trace 进行对比。</p>;
  }

  // traceB = pinned（基准），traceA = 当前选中（对比）
  const base = traceB;
  const cmp  = traceA;

  const msgsBase = parseMessages(base.request_body);
  const msgsCmp  = parseMessages(cmp.request_body);

  if (!msgsBase || !msgsCmp) {
    return <p className="text-red-400 text-sm p-2">无法解析 messages，请确认两条 trace 均为 LLM 请求。</p>;
  }

  const { inA, inB } = computeLCS(msgsBase.map(msgKey), msgsCmp.map(msgKey));
  const removed = msgsBase.filter((_, i) => !inA.has(i));
  const added   = msgsCmp.filter((_, i)  => !inB.has(i));
  const same    = msgsBase.filter((_, i) =>  inA.has(i));
  const compressed = removed.length > 0;

  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="space-y-4">
      {/* Banner */}
      <div className={`rounded-md px-4 py-3 ${
        compressed
          ? 'bg-orange-900/30 border border-orange-700/50'
          : 'bg-green-900/20 border border-green-700/40'
      }`}>
        <div className={`text-sm font-semibold mb-1.5 ${compressed ? 'text-orange-400' : 'text-green-400'}`}>
          {compressed ? '⚠ 可能发生了上下文压缩' : '✓ 未检测到压缩'}
        </div>
        <div className="text-xs text-gray-400 space-y-0.5">
          <div>
            <span className="text-orange-400/80">基准（锁定）</span>
            ：{msgsBase.length} 条消息 · {base.tokens_input ?? '—'} tokens in · {fmtTime(base.timestamp)}
          </div>
          <div>
            <span className="text-blue-400/80">对比（当前）</span>
            ：{msgsCmp.length} 条消息 · {cmp.tokens_input ?? '—'} tokens in · {fmtTime(cmp.timestamp)}
          </div>
          <div className="pt-1.5 flex gap-3">
            <span>消失 <span className="text-red-400 font-semibold">{removed.length}</span></span>
            <span>新增 <span className="text-green-400 font-semibold">{added.length}</span></span>
            <span>共同 <span className="text-gray-400 font-semibold">{same.length}</span></span>
          </div>
        </div>
      </div>

      {/* Removed */}
      <Section title="消失的消息" count={removed.length} colorCls="text-red-400"
        borderCls="border-red-700/60" defaultOpen={true} empty="无">
        {removed.map((msg, i) => (
          <MsgItem key={i} msg={msg} prefix="✕" colorCls="text-red-400" bgCls="bg-red-900/20" />
        ))}
      </Section>

      {/* Same */}
      <Section title="共同消息" count={same.length} colorCls="text-gray-500"
        borderCls="border-gray-700" defaultOpen={false} empty="无">
        {same.map((msg, i) => (
          <MsgItem key={i} msg={msg} prefix="≡" colorCls="text-gray-500" bgCls="bg-gray-800/30" />
        ))}
      </Section>

      {/* Added */}
      <Section title="新增的消息" count={added.length} colorCls="text-green-400"
        borderCls="border-green-700/60" defaultOpen={true} empty="无">
        {added.map((msg, i) => (
          <MsgItem key={i} msg={msg} prefix="＋" colorCls="text-green-400" bgCls="bg-green-900/20" />
        ))}
      </Section>
    </div>
  );
}
