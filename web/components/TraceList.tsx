'use client';

import { useEffect, useState, useRef } from 'react';
import type { TraceSummary } from '@/lib/types';
import { fetchRunTraces, fetchSessionTraces, updateTraceNotes } from '@/lib/api';
import Sparkline from './Sparkline';
import { CompactMeter, useTokenColor } from './ContextMeter';
import { useSettings } from '@/contexts/SettingsContext';
import NotesEditor from './NotesEditor';

interface Props {
  source: { type: 'run'; runId: string } | { type: 'session'; sessionId: string };
  selectedId: string | null;
  pinnedId: string | null;
  onSelect: (id: string) => void;
  refreshTick: number;
  exportMode: boolean;
  selectedSessionIds: Set<string>;
  selectedRunIds: Set<string>;
  selectedTraceIds: Set<string>;
  onToggleExport: (id: string) => void;
  onSelectAllExport: (traceIds: string[]) => void;
  onClearAllExport: (traceIds: string[]) => void;
  /** Called with the source and loaded trace IDs after traces are fetched. */
  onSource?: (source: Props['source'], ids: string[]) => void;
}

function StatusDot({ status }: { status: number }) {
  const color = status < 300 ? 'bg-green-500' : status < 400 ? 'bg-yellow-500' : 'bg-red-500';
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color} shrink-0`} />;
}

const AGENT_BADGE: Record<string, { label: string; cls: string }> = {
  main_agent: { label: 'Main',  cls: 'bg-blue-900/60 text-blue-400' },
  subagent:   { label: 'Sub',   cls: 'bg-purple-900/60 text-purple-400' },
  title_gen:  { label: 'Title', cls: 'bg-gray-700/60 text-gray-500' },
};

function AgentBadge({ agentType }: { agentType: string }) {
  const { label, cls } = AGENT_BADGE[agentType] ?? { label: agentType, cls: 'bg-gray-700/60 text-gray-500' };
  return (
    <span className={`inline-flex items-center px-1 rounded text-[10px] font-medium leading-4 shrink-0 ${cls}`}>
      {label}
    </span>
  );
}

function timeStr(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const FILTER_TYPES: { key: TraceSummary['agent_type']; label: string; active: string; inactive: string }[] = [
  { key: 'main_agent', label: 'Main',  active: 'bg-blue-900/60 text-blue-400',     inactive: 'bg-gray-800 text-gray-600' },
  { key: 'subagent',   label: 'Sub',   active: 'bg-purple-900/60 text-purple-400', inactive: 'bg-gray-800 text-gray-600' },
  { key: 'title_gen',  label: 'Title', active: 'bg-gray-700/60 text-gray-400',     inactive: 'bg-gray-800 text-gray-600' },
];

// ── Token colour (dynamic based on context usage) ─────────────────────────────

function TokenInfo({ tokensInput, tokensOutput, model }: {
  tokensInput: number; tokensOutput: number; model: string;
}) {
  const inputCls = useTokenColor(tokensInput, model);
  return (
    <span>
      <span className={inputCls}>{tokensInput}</span>
      <span className="text-gray-700">+</span>
      <span className="text-green-700">{tokensOutput}</span>
      <span className="text-gray-700"> tok</span>
    </span>
  );
}

export default function TraceList({
  source,
  selectedId,
  pinnedId,
  onSelect,
  refreshTick,
  exportMode,
  selectedSessionIds,
  selectedRunIds,
  selectedTraceIds,
  onToggleExport,
  onSelectAllExport,
  onClearAllExport,
  onSource,
}: Props) {
  const { settings } = useSettings();
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesOverride, setNotesOverride] = useState<Record<string, string | null>>({});
  const [filter, setFilter] = useState<Set<TraceSummary['agent_type']>>(
    new Set(['main_agent', 'subagent', 'title_gen'])
  );
  const listRef = useRef<HTMLDivElement>(null);

  function toggleFilter(key: TraceSummary['agent_type']) {
    setFilter(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next.size === 0 ? prev : next;
    });
  }

  useEffect(() => {
    setLoading(true);
    const req = source.type === 'run'
      ? fetchRunTraces(source.runId)
      : fetchSessionTraces(source.sessionId);
    req.then(t => { setTraces(t); onSource?.(source, t.map(x => x.id)); }).catch(console.error).finally(() => setLoading(false));
  }, [source.type, source.type === 'run' ? source.runId : source.sessionId, refreshTick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setNotesOverride((prev) => {
      const next: Record<string, string | null> = {};
      const available = new Set(traces.map((trace) => trace.id));
      for (const [id, value] of Object.entries(prev)) {
        if (available.has(id)) next[id] = value;
      }
      return next;
    });
  }, [traces]);

  // Scroll to bottom when new traces arrive
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [traces.length]);

  // Scroll selected trace into view (e.g. when clicked from Sparkline)
  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-trace-id="${selectedId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  async function handleSaveNotes(traceId: string, notes: string) {
    await updateTraceNotes(traceId, notes);
    setNotesOverride((prev) => ({ ...prev, [traceId]: notes || null }));
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="px-3 py-2 border-b border-gray-800 shrink-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-400">
            {loading ? '加载中…' : `${traces.filter(t => filter.has(t.agent_type)).length} / ${traces.length} trace${traces.length !== 1 ? 's' : ''}`}
          </p>
          {exportMode && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelectAllExport(traces.map((trace) => trace.id))}
                className="text-[10px] text-gray-500 hover:text-gray-200"
              >
                全选
              </button>
              <button
                type="button"
                onClick={() => onClearAllExport(traces.map((trace) => trace.id))}
                className="text-[10px] text-gray-600 hover:text-gray-300"
              >
                清空
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-1 flex-wrap">
          {FILTER_TYPES.map(({ key, label, active, inactive }) => (
            <button
              key={key}
              onClick={() => toggleFilter(key)}
              className={`px-1.5 py-0 rounded text-[10px] font-medium leading-5 transition-colors ${filter.has(key) ? active : inactive}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sparkline ── */}
      {settings.sparklineEnabled && traces.length > 0 && (
        <div className="px-2 pt-1 pb-0.5 border-b border-gray-800/60 shrink-0 bg-gray-900/30">
          <Sparkline
            traces={traces}
            selectedId={selectedId}
            pinnedId={pinnedId}
            onSelect={onSelect}
          />
        </div>
      )}

      {/* ── List ── */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {!loading && traces.length === 0 && (
          <p className="text-gray-600 text-xs text-center py-8">暂无 trace</p>
        )}

        {traces.filter(t => filter.has(t.agent_type)).map((trace, idx) => {
          const inheritedSelected = selectedSessionIds.has(trace.session_id) || selectedRunIds.has(trace.run_id);
          const traceSelected = inheritedSelected || selectedTraceIds.has(trace.id);

          return (
            <button
              key={trace.id}
              data-trace-id={trace.id}
              onClick={() => onSelect(trace.id)}
              className={`relative w-full text-left px-3 py-2.5 border-b border-gray-800/50 overflow-hidden transition-colors ${
                selectedId === trace.id
                  ? 'bg-blue-900/20 border-l-2 border-l-blue-500'
                  : pinnedId === trace.id
                  ? 'bg-orange-900/10 border-l-2 border-l-orange-500'
                  : 'hover:bg-gray-800/40 border-l-2 border-l-transparent'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <input
                  type="checkbox"
                  checked={traceSelected}
                  disabled={inheritedSelected}
                  onChange={() => onToggleExport(trace.id)}
                  onClick={(e) => e.stopPropagation()}
                  className={`${exportMode ? 'accent-blue-500' : 'hidden'}`}
                  title="加入导出选择"
                />
                <StatusDot status={trace.response_status} />
                <AgentBadge agentType={trace.agent_type} />
                <span className="text-xs text-gray-400 font-semibold">{trace.request_method}</span>
                <span className="text-xs text-gray-500 truncate flex-1" title={trace.request_path}>{trace.request_path}</span>
                <span className="text-xs text-gray-500 shrink-0">#{idx + 1}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span>{timeStr(trace.timestamp)}</span>
                <span>{trace.duration_ms}ms</span>
                {trace.tokens_input > 0 && (
                  <TokenInfo
                    tokensInput={trace.tokens_input}
                    tokensOutput={trace.tokens_output}
                    model={trace.model}
                  />
                )}
              </div>
              {trace.model && (
                <div className="text-xs text-gray-700 mt-0.5 truncate" title={trace.model}>{trace.model}</div>
              )}
              {/* Context meter bar (2px absolute bottom) */}
              {trace.tokens_input > 0 && trace.model && (
                <CompactMeter tokensInput={trace.tokens_input} model={trace.model} />
              )}
              <div className="mt-1.5 pt-1.5 border-t border-gray-800/80" onClick={(e) => e.stopPropagation()}>
                <NotesEditor
                  compact
                  notes={notesOverride[trace.id] !== undefined ? notesOverride[trace.id] : trace.notes}
                  onSave={(n) => handleSaveNotes(trace.id, n)}
                  active={selectedId === trace.id}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
