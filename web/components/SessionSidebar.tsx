'use client';

import type { KeyboardEvent, MouseEvent } from 'react';
import { useRef, useState } from 'react';
import type { Session } from '@/lib/types';
import {
  deleteSession,
  importTraceBundle,
  regroupInnerCCOpenAI,
  updateSessionNotes,
} from '@/lib/api';
import NotesEditor from './NotesEditor';
import SettingsModal from './SettingsModal';

interface Props {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDeleted: (id: string) => void;
  onClearAll: () => void;
  connected: boolean;
  exportMode: boolean;
  selectedForExport: Set<string>;
  onToggleExport: (id: string) => void;
  onSelectAllExport: () => void;
  onClearAllExport: () => void;
  onToggleExportMode: () => void;
  onExportSelected: () => void;
  selectedExportCount: number;
  onImported: () => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

export default function SessionSidebar({
  sessions,
  selectedId,
  onSelect,
  onDeleted,
  onClearAll,
  connected,
  exportMode,
  selectedForExport,
  onToggleExport,
  onSelectAllExport,
  onClearAllExport,
  onToggleExportMode,
  onExportSelected,
  selectedExportCount,
  onImported,
}: Props) {
  // local notes overrides (optimistic update before next fetch)
  const [notesOverride, setNotesOverride] = useState<Record<string, string | null>>({});
  // Settings modal — use a key so reopening always mounts fresh
  const [settingsKey, setSettingsKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const unknownSessionCount = sessions.filter((session) => session.external_id === '__unknown__').length;

  function openSettings() {
    setSettingsKey(k => k + 1);
    setSettingsOpen(true);
  }

  async function handleDelete(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm('删除这个 session 及其所有 runs / traces？')) return;
    await deleteSession(id);
    onDeleted(id);
  }

  async function handleSaveNotes(sessionId: string, notes: string) {
    await updateSessionNotes(sessionId, notes);
    setNotesOverride(prev => ({ ...prev, [sessionId]: notes || null }));
  }

  async function handleImportFile(file: File | null) {
    if (!file) return;
    if (sessions.length > 0) {
      alert('仅允许在空数据库时导入，请先清空当前数据。');
      return;
    }
    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as unknown;
      await importTraceBundle(bundle);
      onImported();
    } catch (error) {
      alert(error instanceof Error ? error.message : '导入失败');
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  async function handleRegroup() {
    try {
      const result = await regroupInnerCCOpenAI();
      alert(`已重整 ${result.traces} 条 InnerCC OpenAI trace，生成 ${result.sessions} 个 session / ${result.runs} 个 run。`);
      onImported();
    } catch (error) {
      alert(error instanceof Error ? error.message : '重整失败');
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-gray-800 shrink-0 space-y-1.5">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-sm font-bold text-gray-100">LLM Router</h1>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${connected ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
            {connected ? '● live' : '○ off'}
          </span>
        </div>
        <div className="flex items-center gap-3 pr-10">
          <p className="text-xs text-gray-500">Sessions</p>
          {exportMode && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onSelectAllExport}
                className="text-[10px] text-gray-500 hover:text-gray-200"
              >
                全选
              </button>
              <button
                type="button"
                onClick={onClearAllExport}
                className="text-[10px] text-gray-600 hover:text-gray-300"
              >
                清空
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-2">
        {sessions.length === 0 && (
          <p className="text-gray-600 text-xs text-center py-8 px-3">
            暂无会话。<br />启动 Code Agent 后自动出现。
          </p>
        )}

        {sessions.map(session => {
          const sessionLabel = session.display_name ?? (
            session.external_id === '__unknown__'
              ? 'unknown'
              : session.external_id.slice(0, 8)
          );

          return (
          <div
            key={session.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(session.id)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(session.id);
              }
            }}
            className={`w-full text-left px-3 py-2 border-l-2 transition-colors group relative cursor-pointer ${
              selectedId === session.id
                ? 'border-blue-500 bg-blue-900/20'
                : 'border-transparent hover:bg-gray-800/50 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <input
                  type="checkbox"
                  checked={selectedForExport.has(session.id)}
                  onChange={() => onToggleExport(session.id)}
                  onClick={(e) => e.stopPropagation()}
                  className={`${exportMode ? 'accent-blue-500' : 'hidden'} shrink-0`}
                  title="加入批量导出"
                />
                <span className="text-xs text-gray-300 font-medium truncate" title={sessionLabel}>
                  {sessionLabel}
                </span>
              </div>
              <span className="text-xs text-gray-500 ml-1 shrink-0">
                {session.run_count} run{session.run_count !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-xs text-gray-600 truncate pr-2">
                {timeAgo(session.updated_at)}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, session.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 text-xs transition-opacity"
                  title="删除会话"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-gray-800/80" onClick={e => e.stopPropagation()}>
                <NotesEditor
                  compact
                  notes={notesOverride[session.id] !== undefined ? notesOverride[session.id] : session.notes}
                  onSave={(n) => handleSaveNotes(session.id, n)}
                  active={selectedId === session.id}
                />
            </div>
          </div>
          );
        })}
      </div>

      {/* Settings modal */}
      {settingsOpen && (
        <SettingsModal key={settingsKey} onClose={() => setSettingsOpen(false)} />
      )}

      {/* Footer */}
      <div className="border-t border-gray-800 px-2 py-1.5 shrink-0 space-y-1">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={openSettings}
            title="设置"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-200 transition-colors px-1.5 py-1 rounded hover:bg-gray-800"
          >
            <span>⚙</span>
            <span>设置</span>
          </button>
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-gray-600 hover:text-red-400 py-1 px-1.5 transition-colors"
          >
            清空
          </button>
        </div>
        <div className="flex items-center justify-between">
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void handleImportFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            disabled={sessions.length > 0}
            onClick={() => importInputRef.current?.click()}
            className={`text-xs py-1 px-1.5 transition-colors ${
              sessions.length > 0
                ? 'text-gray-700 cursor-not-allowed'
                : 'text-gray-600 hover:text-blue-300'
            }`}
            title={sessions.length > 0 ? '仅允许在空数据库时导入' : '导入导出包'}
          >
            导入
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={unknownSessionCount === 0}
              onClick={() => void handleRegroup()}
              className={`text-xs py-1 px-1.5 transition-colors ${
                unknownSessionCount === 0
                  ? 'text-gray-700 cursor-not-allowed'
                  : 'text-gray-600 hover:text-yellow-300'
              }`}
              title={unknownSessionCount === 0 ? '当前没有 unknown session 可重整' : `重整 ${unknownSessionCount} 个 unknown session 中的 InnerCC OpenAI traces`}
            >
              重整 InnerCC {unknownSessionCount > 0 ? `(${unknownSessionCount})` : ''}
            </button>
            <span className="text-[10px] text-gray-700">空数据库可导入</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onToggleExportMode}
            className="text-xs text-gray-600 hover:text-blue-300 py-1 px-1.5 transition-colors"
          >
            {exportMode ? '退出批量导出' : '批量导出'}
          </button>
          <button
            type="button"
            disabled={selectedExportCount === 0}
            onClick={onExportSelected}
            className={`text-xs py-1 px-1.5 transition-colors ${
              selectedExportCount === 0
                ? 'text-gray-700 cursor-not-allowed'
                : 'text-gray-600 hover:text-blue-300'
            }`}
          >
            导出选中 {selectedExportCount > 0 ? `(${selectedExportCount})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
