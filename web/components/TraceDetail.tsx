'use client';

import { useState, useEffect, useRef } from 'react';
import type { TraceDetail as TraceDetailType } from '@/lib/types';
import { fetchTrace } from '@/lib/api';
import { AGENT_LABELS } from '@/lib/types';
import MessageViewer from './MessageViewer';
import ResponseViewer from './ResponseViewer';
import JsonViewer from './JsonViewer';
import DiffViewer from './DiffViewer';
import { buildTraceMessagesExport, downloadJsonFile, traceExportToJson } from '@/lib/exportTraceMessages';
import { updateTraceNotes } from '@/lib/api';
import NotesEditor from './NotesEditor';
import { FullMeter } from './ContextMeter';

function StatusBadge({ status }: { status: number }) {
  const color = status < 300 ? 'bg-green-600' : status < 400 ? 'bg-yellow-600' : 'bg-red-600';
  return <span className={`${color} text-white text-xs px-1.5 py-0.5 rounded font-semibold`}>{status}</span>;
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-500 text-xs w-20 shrink-0">{label}</span>
      <span className="text-gray-200 text-xs">{value}</span>
    </div>
  );
}

type TabKey = 'messages' | 'response' | 'raw_req' | 'raw_res' | 'headers' | 'diff';

interface Props {
  traceId: string;
  pinnedTraceId: string | null;
  onPin: (id: string | null) => void;
  /** Jump to a specific message: { traceId, index } and highlight it in the Messages tab. */
  jumpTo?: { traceId: string; index: number } | null;
  /** Forwarded from page → TraceDetail → DiffViewer. */
  onJumpToMessage?: (traceId: string, index: number) => void;
}

export default function TraceDetail({ traceId, pinnedTraceId, onPin, jumpTo, onJumpToMessage }: Props) {
  const [trace,       setTrace]       = useState<TraceDetailType | null>(null);
  const [pinnedTrace, setPinnedTrace] = useState<TraceDetailType | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState<TabKey>('messages');
  const [localNotes,  setLocalNotes]  = useState<string | null>(null);
  const [notesKey,    setNotesKey]    = useState(0); // force NotesEditor reset on trace change
  const [allExpanded, setAllExpanded] = useState<'collapsed' | 'default' | 'expanded'>('default');
  const [viewerKey,   setViewerKey]   = useState(0);
  // Highlight state — persists across re-renders within the same trace view
  const [highlightIdx,  setHighlightIdx]  = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // When jumpTo changes: switch to Messages tab and apply highlight.
  // Guard: only apply if this jump is actually targeting THIS trace.
  useEffect(() => {
    if (jumpTo == null || jumpTo.traceId !== traceId) return;
    setHighlightIdx(jumpTo.index);
    setTab('messages');
  }, [jumpTo, traceId]);

  useEffect(() => {
    setLoading(true);
    setTrace(null);
    setLocalNotes(null);
    setNotesKey(k => k + 1);
    fetchTrace(traceId)
      .then(setTrace)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [traceId]);

  useEffect(() => {
    if (!pinnedTraceId) { setPinnedTrace(null); return; }
    fetchTrace(pinnedTraceId).then(setPinnedTrace).catch(console.error);
  }, [pinnedTraceId]);

  // Scroll to highlighted message once messages are rendered.
  // We own the scroll container here, so we can do this reliably.
  useEffect(() => {
    if (loading || !trace || highlightIdx == null || tab !== 'messages') return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const id = requestAnimationFrame(() => {
      const el = container.querySelector<HTMLElement>(`[data-msg-idx="${highlightIdx}"]`);
      if (!el) return;
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      // Center the element in the scroll container
      container.scrollTop += elRect.top - containerRect.top - containerRect.height / 2 + elRect.height / 2;
    });
    return () => cancelAnimationFrame(id);
  }, [loading, trace, highlightIdx, tab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Loading trace…
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400 text-sm">
        Failed to load trace
      </div>
    );
  }

  const ts = new Date(trace.timestamp).toLocaleString('zh-CN');

  const EXPANDABLE_TABS = new Set<TabKey>(['raw_req', 'raw_res', 'headers', 'messages', 'response', 'diff']);

  function handleTabChange(key: TabKey) {
    setTab(key);
    if (EXPANDABLE_TABS.has(key)) {
      setAllExpanded('default');
      setViewerKey(k => k + 1);
    }
  }

  function setExpand(state: 'collapsed' | 'default' | 'expanded') {
    setAllExpanded(state);
    setViewerKey(k => k + 1);
  }

  const expandDepth = allExpanded === 'collapsed' ? 1 : allExpanded === 'default' ? 3 : 999;

  const hasDiff = pinnedTraceId !== null && pinnedTraceId !== traceId;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'messages',  label: 'Messages' },
    { key: 'response',  label: 'Response' },
    { key: 'raw_req',   label: 'Raw Request' },
    { key: 'raw_res',   label: 'Raw Response' },
    { key: 'headers',   label: 'Headers' },
    ...(hasDiff ? [{ key: 'diff' as TabKey, label: 'Diff' }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/50 shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold text-gray-300">{trace.request_method}</span>
          <span className="text-gray-400 text-xs flex-1 truncate">{trace.request_path}</span>
          <button
            type="button"
            onClick={() => {
              const payload = buildTraceMessagesExport(trace);
              const text = traceExportToJson(payload, true);
              downloadJsonFile(`trace-${trace.id}-messages.json`, text);
            }}
            className="shrink-0 text-xs px-2.5 py-1 rounded border border-gray-600 text-gray-300 hover:bg-gray-800 hover:border-gray-500 transition-colors"
            title="导出为 OpenAI Chat 兼容的 messages + metadata JSON"
          >
            导出 messages
          </button>
          <StatusBadge status={trace.response_status} />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <MetaRow label="agent"    value={AGENT_LABELS[trace.agent] ?? trace.agent} />
          <MetaRow label="time"     value={ts} />
          <MetaRow label="model"    value={trace.model} />
          <MetaRow label="duration" value={`${trace.duration_ms} ms`} />
          <MetaRow label="tokens in"  value={
            <span className="inline-flex items-center gap-2">
              <span className="text-yellow-300">{trace.tokens_input ?? '—'}</span>
              {trace.tokens_input && trace.model && (
                <FullMeter tokensInput={trace.tokens_input} model={trace.model} />
              )}
            </span>
          } />
          <MetaRow label="tokens out" value={<span className="text-green-300">{trace.tokens_output ?? '—'}</span>} />
        </div>
        <div className="mt-2 pt-2 border-t border-gray-800/60">
          <NotesEditor
            key={notesKey}
            notes={localNotes !== null ? localNotes : trace.notes}
            onSave={async (n) => {
              await updateTraceNotes(trace.id, n);
              setLocalNotes(n || null);
            }}
          />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center border-b border-gray-800 shrink-0 bg-gray-900/30">
        <div className="flex flex-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
                tab === t.key
                  ? t.key === 'diff'
                    ? 'border-orange-500 text-orange-400'
                    : 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Expand/collapse all */}
        {EXPANDABLE_TABS.has(tab) && (
          <div className="flex gap-1 mr-2">
            {(['collapsed', 'default', 'expanded'] as const).map(state => (
              <button
                key={state}
                type="button"
                onClick={() => setExpand(state)}
                className={`px-2 py-1 text-[11px] rounded border transition-colors shrink-0 ${
                  allExpanded === state
                    ? 'border-blue-600 text-blue-400 bg-blue-900/20'
                    : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500'
                }`}
              >
                {state === 'collapsed' ? '折叠' : state === 'default' ? '默认' : '展开'}
              </button>
            ))}
          </div>
        )}
        {/* Pin button */}
        <button
          type="button"
          onClick={() => onPin(pinnedTraceId === traceId ? null : traceId)}
          className={`mr-3 px-2 py-1 text-[11px] rounded border transition-colors shrink-0 ${
            pinnedTraceId === traceId
              ? 'border-orange-600 text-orange-400 bg-orange-900/20 hover:bg-orange-900/40'
              : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500'
          }`}
        >
          {pinnedTraceId === traceId ? '📌 已锁定' : '锁定为基准'}
        </button>
      </div>

      {/* ── Tab content ── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
        {tab === 'messages' && (
          <MessageViewer key={viewerKey} requestBody={trace.request_body} protocol={trace.protocol} expandOverride={allExpanded} highlightIdx={highlightIdx} />
        )}
        {tab === 'response' && (
          <ResponseViewer key={viewerKey} responseBody={trace.response_body} protocol={trace.protocol} expandDepth={expandDepth} />
        )}
        {tab === 'raw_req' && (
          <div className="bg-gray-900/50 rounded-md p-3">
            <JsonViewer key={viewerKey} data={trace.request_body} defaultExpand={expandDepth} />
          </div>
        )}
        {tab === 'raw_res' && (
          <div className="bg-gray-900/50 rounded-md p-3">
            <JsonViewer key={viewerKey} data={trace.response_body} defaultExpand={expandDepth} />
          </div>
        )}
        {tab === 'diff' && hasDiff && (
          pinnedTrace
            ? <DiffViewer
                key={viewerKey}
                traceA={trace}
                traceB={pinnedTrace}
                expandOverride={allExpanded}
                currentTraceId={traceId}
                onJumpToMessage={onJumpToMessage}
              />
            : <p className="text-gray-500 text-sm">加载基准 trace 中…</p>
        )}
        {tab === 'headers' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide">Request Headers</h3>
              <div className="bg-gray-900/50 rounded-md p-3">
                <JsonViewer key={viewerKey} data={trace.request_headers} defaultExpand={expandDepth} />
              </div>
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide">Response Headers</h3>
              <div className="bg-gray-900/50 rounded-md p-3">
                <JsonViewer key={`${viewerKey}-res`} data={trace.response_headers} defaultExpand={expandDepth} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
