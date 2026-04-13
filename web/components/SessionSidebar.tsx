'use client';

import type { KeyboardEvent, MouseEvent } from 'react';
import type { Session } from '@/lib/types';
import { AGENT_LABELS, AGENT_COLORS, AGENT_BG } from '@/lib/types';
import { deleteSession } from '@/lib/api';

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

// Group sessions by agent
function groupByAgent(sessions: Session[]): Record<string, Session[]> {
  const groups: Record<string, Session[]> = {};
  for (const s of sessions) {
    if (!groups[s.agent]) groups[s.agent] = [];
    groups[s.agent].push(s);
  }
  return groups;
}

const AGENT_ORDER = ['anthropic', 'openai'];

export default function SessionSidebar({
  sessions,
  selectedId,
  onSelect,
  onDeleted,
  onClearAll,
  connected,
}: Props) {
  const groups = groupByAgent(sessions);

  async function handleDelete(e: MouseEvent, id: string) {
    e.stopPropagation();
    await deleteSession(id);
    onDeleted(id);
  }

  const agents = [
    ...AGENT_ORDER.filter(a => groups[a]),
    ...Object.keys(groups).filter(a => !AGENT_ORDER.includes(a)),
  ];

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
        <p className="text-xs text-gray-500">Trace Viewer</p>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-2">
        {sessions.length === 0 && (
          <p className="text-gray-600 text-xs text-center py-8 px-3">
            No sessions yet.<br />Start a Code Agent.
          </p>
        )}

        {agents.map(agent => (
          <div key={agent} className="mb-2">
            <div className={`mx-2 px-2 py-1 rounded text-xs font-bold ${AGENT_COLORS[agent] ?? 'text-gray-400'}`}>
              {AGENT_LABELS[agent] ?? agent}
            </div>
            {groups[agent].map(session => (
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
                className={`w-full text-left px-3 py-2 mx-0 border-l-2 transition-colors group relative cursor-pointer ${
                  selectedId === session.id
                    ? `border-blue-500 bg-blue-900/20`
                    : `border-transparent hover:bg-gray-800/50 hover:border-gray-600`
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-300 font-medium truncate">
                    Session {session.id.slice(0, 8)}
                  </span>
                  <span className={`text-xs px-1 rounded ml-1 shrink-0 ${AGENT_BG[agent] ?? 'bg-gray-700'} ${AGENT_COLORS[agent] ?? 'text-gray-400'}`}>
                    {session.trace_count}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-gray-600">{timeAgo(session.updated_at)}</span>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, session.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 text-xs ml-1 transition-opacity"
                    title="Delete session"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-800 p-2 shrink-0">
        <button
          type="button"
          onClick={onClearAll}
          className="w-full text-xs text-gray-600 hover:text-red-400 py-1 transition-colors"
        >
          Clear all data
        </button>
      </div>
    </div>
  );
}
