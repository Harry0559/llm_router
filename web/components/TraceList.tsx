'use client';

import { useEffect, useState, useRef } from 'react';
import type { TraceSummary } from '@/lib/types';
import { fetchRunTraces, fetchSessionTraces } from '@/lib/api';

interface Props {
  source: { type: 'run'; runId: string } | { type: 'session'; sessionId: string };
  selectedId: string | null;
  onSelect: (id: string) => void;
  refreshTick: number;
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

export default function TraceList({ source, selectedId, onSelect, refreshTick }: Props) {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Set<TraceSummary['agent_type']>>(
    new Set(['main_agent', 'subagent', 'title_gen'])
  );
  const listRef = useRef<HTMLDivElement>(null);

  function toggleFilter(key: TraceSummary['agent_type']) {
    setFilter(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next.size === 0 ? prev : next; // 至少保留一个
    });
  }

  useEffect(() => {
    setLoading(true);
    const req = source.type === 'run'
      ? fetchRunTraces(source.runId)
      : fetchSessionTraces(source.sessionId);
    req.then(setTraces).catch(console.error).finally(() => setLoading(false));
  }, [source.type, source.type === 'run' ? source.runId : source.sessionId, refreshTick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [traces.length]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 shrink-0 space-y-1.5">
        <p className="text-xs text-gray-400">
          {loading ? '加载中…' : `${traces.filter(t => filter.has(t.agent_type)).length} / ${traces.length} trace${traces.length !== 1 ? 's' : ''}`}
        </p>
        <div className="flex gap-1">
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

      {/* List */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {!loading && traces.length === 0 && (
          <p className="text-gray-600 text-xs text-center py-8">暂无 trace</p>
        )}

        {traces.filter(t => filter.has(t.agent_type)).map((trace, idx) => (
          <button
            key={trace.id}
            onClick={() => onSelect(trace.id)}
            className={`w-full text-left px-3 py-2.5 border-b border-gray-800/50 transition-colors ${
              selectedId === trace.id
                ? 'bg-blue-900/20 border-l-2 border-l-blue-500'
                : 'hover:bg-gray-800/40 border-l-2 border-l-transparent'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <StatusDot status={trace.response_status} />
              <AgentBadge agentType={trace.agent_type} />
              <span className="text-xs text-gray-400 font-semibold">{trace.request_method}</span>
              <span className="text-xs text-gray-500 truncate flex-1">{trace.request_path}</span>
              <span className="text-xs text-gray-500 shrink-0">#{idx + 1}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span>{timeStr(trace.timestamp)}</span>
              <span>{trace.duration_ms}ms</span>
              {trace.tokens_input > 0 && (
                <span>
                  <span className="text-yellow-700">{trace.tokens_input}</span>
                  <span className="text-gray-700">+</span>
                  <span className="text-green-700">{trace.tokens_output}</span>
                  <span className="text-gray-700"> tok</span>
                </span>
              )}
            </div>
            {trace.model && (
              <div className="text-xs text-gray-700 mt-0.5 truncate">{trace.model}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
