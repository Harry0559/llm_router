'use client';

import { useEffect, useState, useRef } from 'react';
import type { TraceSummary } from '@/lib/types';
import { fetchRunTraces } from '@/lib/api';

interface Props {
  runId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  refreshTick: number;
}

function StatusDot({ status }: { status: number }) {
  const color = status < 300 ? 'bg-green-500' : status < 400 ? 'bg-yellow-500' : 'bg-red-500';
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color} shrink-0`} />;
}

function timeStr(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function TraceList({ runId, selectedId, onSelect, refreshTick }: Props) {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    fetchRunTraces(runId)
      .then(setTraces)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [runId, refreshTick]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [traces.length]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 shrink-0">
        <p className="text-xs text-gray-400">
          {loading ? '加载中…' : `${traces.length} trace${traces.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* List */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {!loading && traces.length === 0 && (
          <p className="text-gray-600 text-xs text-center py-8">暂无 trace</p>
        )}

        {traces.map((trace, idx) => (
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
