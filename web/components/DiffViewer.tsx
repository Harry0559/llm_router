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

/** Returns matched index pairs [earlyIndex, lateIndex], sorted by earlyIndex ascending. */
function computeLCS(a: string[], b: string[]): [number, number][] {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);

  const pairs: [number, number][] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i-1] === b[j-1]) { pairs.push([i-1, j-1]); i--; j--; }
    else if (dp[i-1][j] >= dp[i][j-1]) i--;
    else                               j--;
  }
  return pairs; // backtrack gives reverse order; caller should sort
}

// ── sub-components ────────────────────────────────────────────────────────────

/** A message annotated with its 0-based index in the original sequence. */
interface IndexedMsg {
  msg: Msg;
  index: number; // 0-based in the appropriate trace
}

/** Same message present in both traces, annotated with indices from both sequences. */
interface SameMsg extends IndexedMsg {
  indexB: number; // 0-based index in the late/compare trace
}

function MsgItem({ item, indexLabel, colorCls, bgCls, initialExpanded = false, onIndexClick }: {
  item: IndexedMsg; indexLabel: string; colorCls: string; bgCls: string;
  initialExpanded?: boolean; onIndexClick?: (index: number) => void;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const preview = previewContent(item.msg.content);
  return (
    <button
      type="button"
      onClick={() => setExpanded(v => !v)}
      className={`w-full text-left px-3 py-2 rounded mb-1 ${bgCls} hover:opacity-90 transition-opacity`}
    >
      {/* Top row: [index] role */}
      <div className="flex items-center gap-2 mb-1">
        <span
          onClick={(e) => { e.stopPropagation(); onIndexClick?.(item.index); }}
          className={`text-xs font-bold shrink-0 cursor-pointer hover:underline ${colorCls}`}
          title="跳转到 Messages"
        >{indexLabel}</span>
        <span className={`text-xs font-semibold shrink-0 ${colorCls}`}>{item.msg.role}</span>
      </div>
      {/* Content row */}
      <div className="pl-0 text-xs text-gray-300 whitespace-pre-wrap break-all">
        {expanded
          ? JSON.stringify(item.msg.content, null, 2)
          : preview + (preview.length >= 120 ? '…' : '')}
      </div>
    </button>
  );
}

/** Variant for "same" messages: two separate clickable index badges. */
function SameMsgItem({ item, bgCls, initialExpanded = false,
  earlyIsBase, onJumpEarly, onJumpLate }: {
  item: SameMsg; bgCls: string; initialExpanded?: boolean;
  /** True when the early trace is the pinned/base trace. */
  earlyIsBase: boolean;
  onJumpEarly?: () => void; onJumpLate?: () => void;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const preview = previewContent(item.msg.content);

  // Colours: base trace badge = orange, compare trace badge = blue
  const earlyBadgeCls = earlyIsBase ? 'text-orange-400/80' : 'text-blue-400/80';
  const lateBadgeCls  = earlyIsBase ? 'text-blue-400/80'   : 'text-orange-400/80';
  const earlyTitle    = earlyIsBase ? '跳转到基准（锁定）trace 的 Messages' : '跳转到对比 trace 的 Messages';
  const lateTitle     = earlyIsBase ? '跳转到对比 trace 的 Messages'       : '跳转到基准（锁定）trace 的 Messages';

  return (
    <button
      type="button"
      onClick={() => setExpanded(v => !v)}
      className={`w-full text-left px-3 py-2 rounded mb-1 ${bgCls} hover:opacity-90 transition-opacity`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span
          onClick={(e) => { e.stopPropagation(); onJumpEarly?.(); }}
          className={`text-xs font-bold shrink-0 cursor-pointer hover:underline ${earlyBadgeCls}`}
          title={earlyTitle}
        >[{item.index}]</span>
        <span className="text-xs text-gray-600 shrink-0">→</span>
        <span
          onClick={(e) => { e.stopPropagation(); onJumpLate?.(); }}
          className={`text-xs font-bold shrink-0 cursor-pointer hover:underline ${lateBadgeCls}`}
          title={lateTitle}
        >[{item.indexB}]</span>
        <span className="text-xs font-semibold shrink-0 text-gray-400 ml-1">{item.msg.role}</span>
      </div>
      <div className="pl-0 text-xs text-gray-300 whitespace-pre-wrap break-all">
        {expanded
          ? JSON.stringify(item.msg.content, null, 2)
          : preview + (preview.length >= 120 ? '…' : '')}
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

export default function DiffViewer({ traceA, traceB, expandOverride = 'default', currentTraceId, onJumpToMessage }: {
  traceA: TraceDetail;
  traceB: TraceDetail;
  expandOverride?: 'collapsed' | 'default' | 'expanded';
  /** The trace ID currently displayed in the detail panel. */
  currentTraceId?: string;
  /** Called when user clicks an index badge to jump to that message in Messages tab. */
  onJumpToMessage?: (traceId: string, index: number) => void;
}) {
  if (traceA.id === traceB.id) {
    return <p className="text-gray-500 text-sm p-2">请选择不同的 trace 进行对比。</p>;
  }

  const base = traceB; // pinned = baseline
  const cmp  = traceA; // current = comparison

  // diff 方向：始终以时间早的为参照，晚的和它比
  const [early, late] = base.timestamp <= cmp.timestamp ? [base, cmp] : [cmp, base];

  const msgsEarly = parseMessages(early.request_body);
  const msgsLate  = parseMessages(late.request_body);

  if (!msgsEarly || !msgsLate) {
    return <p className="text-red-400 text-sm p-2">无法解析 messages，请确认两条 trace 均为 LLM 请求。</p>;
  }

  const pairs = computeLCS(msgsEarly.map(msgKey), msgsLate.map(msgKey));
  // Sort pairs by early index so removed/added/same are in natural order
  pairs.sort((a, b) => a[0] - b[0]);

  const earlyIndexSet = new Set(pairs.map(p => p[0]));
  const lateIndexSet  = new Set(pairs.map(p => p[1]));

  // Removed: in early but not in any pair
  const removed: IndexedMsg[] = msgsEarly
    .map((msg, i) => ({ msg, index: i }))
    .filter(item => !earlyIndexSet.has(item.index));

  // Added: in late but not in any pair
  const added: IndexedMsg[] = msgsLate
    .map((msg, i) => ({ msg, index: i }))
    .filter(item => !lateIndexSet.has(item.index));

  // Same: matched pair — indexB is the corresponding late trace index
  const same: SameMsg[] = pairs.map(([index, indexB]) => ({
    msg: msgsEarly[index],
    index,
    indexB,
  }));

  const compressed = removed.length > 0;

  // Whether the early trace is the pinned/base trace (affects badge colours)
  const earlyIsBase = early.id === base.id;

  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const msgExpanded  = expandOverride === 'expanded';
  const removedOpen  = expandOverride !== 'collapsed';
  const addedOpen    = expandOverride !== 'collapsed';
  const sameOpen     = expandOverride === 'expanded';

  return (
    <div className="space-y-4">
      {/* Banner — always shows early first, late second */}
      <div className={`rounded-md px-4 py-3 ${
        compressed
          ? 'bg-orange-900/30 border border-orange-700/50'
          : 'bg-green-900/20 border border-green-700/40'
      }`}>
        <div className={`text-sm font-semibold mb-1.5 ${compressed ? 'text-orange-400' : 'text-green-400'}`}>
          {compressed ? '⚠ 可能发生了上下文压缩' : '✓ 未检测到压缩'}
        </div>
        <div className="text-xs text-gray-400 space-y-0.5">
          {/* Early trace row */}
          <div>
            <span className={earlyIsBase ? 'text-orange-400/80' : 'text-blue-400/80'}>
              {earlyIsBase ? '基准（锁定）' : '对比（当前）'}
            </span>
            <span className="text-gray-600 ml-1 text-[10px]">← 靠前</span>
            ：{msgsEarly.length} 条消息 · {early.tokens_input ?? '—'} tokens in · {fmtTime(early.timestamp)}
          </div>
          {/* Late trace row */}
          <div>
            <span className={earlyIsBase ? 'text-blue-400/80' : 'text-orange-400/80'}>
              {earlyIsBase ? '对比（当前）' : '基准（锁定）'}
            </span>
            <span className="text-gray-600 ml-1 text-[10px]">← 靠后</span>
            ：{msgsLate.length} 条消息 · {late.tokens_input ?? '—'} tokens in · {fmtTime(late.timestamp)}
          </div>
          <div className="pt-1.5 flex gap-3">
            <span>消失 <span className="text-red-400 font-semibold">{removed.length}</span></span>
            <span>新增 <span className="text-green-400 font-semibold">{added.length}</span></span>
            <span>共同 <span className="text-gray-400 font-semibold">{same.length}</span></span>
          </div>
        </div>
      </div>

      {/* Removed — exist in early, gone in late → jump to early trace */}
      <Section title="消失的消息" count={removed.length} colorCls="text-red-400"
        borderCls="border-red-700/60" defaultOpen={removedOpen} empty="无">
        {removed.map(item => (
          <MsgItem
            key={item.index}
            item={item}
            indexLabel={`[${item.index}]`}
            colorCls="text-red-400"
            bgCls="bg-red-900/20"
            initialExpanded={msgExpanded}
            onIndexClick={(idx) => onJumpToMessage?.(early.id, idx)}
          />
        ))}
      </Section>

      {/* Same — two clickable badges [earlyIdx]->[lateIdx], each jumps to its own trace */}
      <Section title="共同消息" count={same.length} colorCls="text-gray-400"
        borderCls="border-gray-700" defaultOpen={sameOpen} empty="无">
        {same.map(item => (
          <SameMsgItem
            key={item.index}
            item={item}
            bgCls="bg-gray-800/30"
            initialExpanded={msgExpanded}
            earlyIsBase={earlyIsBase}
            onJumpEarly={() => onJumpToMessage?.(early.id, item.index)}
            onJumpLate={() => onJumpToMessage?.(late.id, item.indexB)}
          />
        ))}
      </Section>

      {/* Added — exist in late, not in early → jump to late trace */}
      <Section title="新增的消息" count={added.length} colorCls="text-green-400"
        borderCls="border-green-700/60" defaultOpen={addedOpen} empty="无">
        {added.map(item => (
          <MsgItem
            key={item.index}
            item={item}
            indexLabel={`[${item.index}]`}
            colorCls="text-green-400"
            bgCls="bg-green-900/20"
            initialExpanded={msgExpanded}
            onIndexClick={(idx) => onJumpToMessage?.(late.id, idx)}
          />
        ))}
      </Section>
    </div>
  );
}
