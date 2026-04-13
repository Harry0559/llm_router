'use client';

import { useEffect, useState } from 'react';
import type { Run } from '@/lib/types';
import { fetchRuns, deleteRun } from '@/lib/api';

interface Props {
  sessionId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDeleted: (id: string) => void;
  refreshTick: number;
}

function timeStr(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function RunList({ sessionId, selectedId, onSelect, onDeleted, refreshTick }: Props) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchRuns(sessionId)
      .then(setRuns)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sessionId, refreshTick]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await deleteRun(id);
    onDeleted(id);
    setRuns(r => r.filter(x => x.id !== id));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 shrink-0">
        <p className="text-xs text-gray-400">
          {loading ? '加载中…' : `${runs.length} run${runs.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {!loading && runs.length === 0 && (
          <p className="text-gray-600 text-xs text-center py-8">暂无 run</p>
        )}

        {runs.map((run, idx) => (
          <div
            key={run.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(run.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(run.id); }
            }}
            className={`w-full text-left px-3 py-2.5 border-b border-gray-800/50 transition-colors group relative cursor-pointer ${
              selectedId === run.id
                ? 'bg-blue-900/20 border-l-2 border-l-blue-500'
                : 'hover:bg-gray-800/40 border-l-2 border-l-transparent'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-300">Run #{idx + 1}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">{run.trace_count} trace{run.trace_count !== 1 ? 's' : ''}</span>
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, run.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 text-xs transition-opacity"
                  title="删除 run"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="text-xs text-gray-600">{timeStr(run.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
