'use client';

import { useEffect, useState } from 'react';
import type { Run } from '@/lib/types';
import { deleteRun, fetchRuns, updateRunNotes } from '@/lib/api';
import NotesEditor from './NotesEditor';

interface Props {
  sessionId: string;
  selectedId: string | null;
  allSelected: boolean;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onDeleted: (id: string) => void;
  refreshTick: number;
  exportMode: boolean;
  sessionSelectedForExport: boolean;
  selectedForExport: Set<string>;
  onToggleExport: (id: string) => void;
  onSelectAllExport: (runIds: string[]) => void;
  onClearAllExport: (runIds: string[]) => void;
}

function timeStr(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function RunList({
  sessionId,
  selectedId,
  allSelected,
  onSelect,
  onSelectAll,
  onDeleted,
  refreshTick,
  exportMode,
  sessionSelectedForExport,
  selectedForExport,
  onToggleExport,
  onSelectAllExport,
  onClearAllExport,
}: Props) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesOverride, setNotesOverride] = useState<Record<string, string | null>>({});

  useEffect(() => {
    setLoading(true);
    fetchRuns(sessionId)
      .then(setRuns)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sessionId, refreshTick]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm('删除这个 run 及其所有 traces？')) return;
    await deleteRun(id);
    onDeleted(id);
    setRuns(r => r.filter(x => x.id !== id));
  }

  async function handleSaveNotes(runId: string, notes: string) {
    await updateRunNotes(runId, notes);
    setNotesOverride(prev => ({ ...prev, [runId]: notes || null }));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 shrink-0 space-y-1">
        <div className="flex items-center gap-3 pr-10">
          <p className="text-xs text-gray-400">
            {loading ? '加载中…' : `${runs.length} run${runs.length !== 1 ? 's' : ''}`}
          </p>
          {exportMode && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelectAllExport(runs.map((run) => run.id))}
                className="text-[10px] text-gray-500 hover:text-gray-200"
              >
                全选
              </button>
              <button
                type="button"
                onClick={() => onClearAllExport(runs.map((run) => run.id))}
                className="text-[10px] text-gray-600 hover:text-gray-300"
              >
                清空
              </button>
            </div>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {/* All Traces entry */}
        <div
          role="button"
          tabIndex={0}
          onClick={onSelectAll}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectAll(); } }}
          className={`w-full text-left px-3 py-2.5 border-b border-gray-800/50 transition-colors cursor-pointer ${
            allSelected
              ? 'bg-blue-900/20 border-l-2 border-l-blue-500'
              : 'hover:bg-gray-800/40 border-l-2 border-l-transparent'
          }`}
        >
          <span className="text-xs font-semibold text-gray-300">All Traces</span>
        </div>

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
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <input
                  type="checkbox"
                  checked={sessionSelectedForExport || selectedForExport.has(run.id)}
                  disabled={sessionSelectedForExport}
                  onChange={() => onToggleExport(run.id)}
                  onClick={(e) => e.stopPropagation()}
                  className={`${exportMode ? 'accent-blue-500' : 'hidden'} shrink-0`}
                  title="加入批量导出"
                />
                <span
                  className="text-xs font-semibold text-gray-300 truncate pr-2"
                  title={run.display_name ?? `Run #${idx + 1}`}
                >
                  {run.display_name ?? `Run #${idx + 1}`}
                </span>
              </div>
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
            <div className="mt-1.5 pt-1.5 border-t border-gray-800/80" onClick={e => e.stopPropagation()}>
              <NotesEditor
                compact
                notes={notesOverride[run.id] !== undefined ? notesOverride[run.id] : run.notes}
                onSave={(n) => handleSaveNotes(run.id, n)}
                active={selectedId === run.id}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
