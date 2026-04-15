'use client';

import type { KeyboardEvent, MouseEvent } from 'react';
import { useState } from 'react';
import type { Session } from '@/lib/types';
import { deleteSession, updateSessionNotes } from '@/lib/api';
import NotesEditor from './NotesEditor';
import SettingsModal from './SettingsModal';

interface Props {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDeleted: (id: string) => void;
  onClearAll: () => void;
  connected: boolean;
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
}: Props) {
  // local notes overrides (optimistic update before next fetch)
  const [notesOverride, setNotesOverride] = useState<Record<string, string | null>>({});
  // Settings modal — use a key so reopening always mounts fresh
  const [settingsKey, setSettingsKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  function openSettings() {
    setSettingsKey(k => k + 1);
    setSettingsOpen(true);
  }

  async function handleDelete(e: MouseEvent, id: string) {
    e.stopPropagation();
    await deleteSession(id);
    onDeleted(id);
  }

  async function handleSaveNotes(sessionId: string, notes: string) {
    await updateSessionNotes(sessionId, notes);
    setNotesOverride(prev => ({ ...prev, [sessionId]: notes || null }));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-gray-800 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-sm font-bold text-gray-100">LLM Router</h1>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${connected ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
            {connected ? '● live' : '○ off'}
          </span>
        </div>
        <p className="text-xs text-gray-500">Sessions</p>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-2">
        {sessions.length === 0 && (
          <p className="text-gray-600 text-xs text-center py-8 px-3">
            暂无会话。<br />启动 Code Agent 后自动出现。
          </p>
        )}

        {sessions.map(session => (
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
              <span className="text-xs text-gray-300 font-mono font-medium truncate">
                {session.external_id === '__unknown__'
                  ? 'unknown'
                  : session.external_id.slice(0, 8)}
              </span>
              <span className="text-xs text-gray-500 ml-1 shrink-0">
                {session.run_count} run{session.run_count !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-xs text-gray-600">{timeAgo(session.updated_at)}</span>
              <button
                type="button"
                onClick={(e) => handleDelete(e, session.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 text-xs ml-1 transition-opacity"
                title="删除会话"
              >
                ✕
              </button>
            </div>
            {selectedId === session.id && (
              <div className="mt-1.5 pt-1.5 border-t border-gray-800/80" onClick={e => e.stopPropagation()}>
                <NotesEditor
                  compact
                  notes={notesOverride[session.id] !== undefined ? notesOverride[session.id] : session.notes}
                  onSave={(n) => handleSaveNotes(session.id, n)}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Settings modal */}
      {settingsOpen && (
        <SettingsModal key={settingsKey} onClose={() => setSettingsOpen(false)} />
      )}

      {/* Footer */}
      <div className="border-t border-gray-800 px-2 py-1.5 shrink-0 flex items-center justify-between">
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
    </div>
  );
}
