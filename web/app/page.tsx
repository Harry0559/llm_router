'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Session } from '@/lib/types';
import { fetchSessions, clearAllData, createEventSource } from '@/lib/api';
import SessionSidebar from '@/components/SessionSidebar';
import RunList from '@/components/RunList';
import TraceList from '@/components/TraceList';
import TraceDetail from '@/components/TraceDetail';
import { SettingsProvider } from '@/contexts/SettingsContext';

// ── Collapsible column wrapper ────────────────────────────────────────────────
interface ColProps {
  label: string;
  open: boolean;
  onToggle: () => void;
  expandedWidth: string; // Tailwind width class, e.g. 'w-44'
  border?: boolean;
  btnTop?: string;       // vertical position of collapse button, default 'top-2'
  children: React.ReactNode;
}

function Col({ label, open, onToggle, expandedWidth, border = true, btnTop = 'top-2', children }: ColProps) {
  return (
    <div
      className={`relative shrink-0 flex flex-col overflow-hidden transition-all duration-200
        ${open ? expandedWidth : 'w-8'}
        ${border ? 'border-r border-gray-800' : ''}`}
    >
      {open ? (
        <>
          {children}
          {/* Collapse button — absolute, top-right corner */}
          <button
            onClick={onToggle}
            title="折叠"
            className={`absolute ${btnTop} right-1.5 z-10 text-gray-400 hover:text-gray-100 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-1 py-0.5 text-xs leading-none select-none transition-colors`}
          >
            ‹
          </button>
        </>
      ) : (
        /* Collapsed strip */
        <div className="flex flex-col items-center h-full py-3 gap-3">
          <button
            onClick={onToggle}
            title="展开"
            className="text-gray-400 hover:text-gray-100 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-1 py-0.5 text-xs leading-none select-none transition-colors"
          >
            ›
          </button>
          <span className="text-xs text-gray-600 select-none" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            {label}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [selectedRun,     setSelectedRun]     = useState<string | null>(null);
  const [allTraces,       setAllTraces]       = useState(false);
  const [selectedTrace,   setSelectedTrace]   = useState<string | null>(null);
  const [pinnedTrace,     setPinnedTrace]     = useState<string | null>(null);
  const [sessionTick, setSessionTick] = useState(0);
  const [runTick,     setRunTick]     = useState(0);
  const [traceTick,   setTraceTick]   = useState(0);
  const [connected, setConnected] = useState(false);

  const [col1Open, setCol1Open] = useState(true);
  const [col2Open, setCol2Open] = useState(true);
  const [col3Open, setCol3Open] = useState(true);
  const [jumpTarget, setJumpTarget] = useState<{ traceId: string; index: number } | null>(null);

  const esRef = useRef<EventSource | null>(null);

  const loadSessions = useCallback(() => {
    fetchSessions().then(setSessions).catch(console.error);
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // SSE connection
  useEffect(() => {
    let es: EventSource;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      try {
        es = createEventSource();
        esRef.current = es;
        es.onopen = () => setConnected(true);

        es.addEventListener('new_trace', (e: MessageEvent) => {
          const data = JSON.parse(e.data as string) as {
            session_id?: string;
            run_id?: string;
          };

          loadSessions();

          if (data.session_id === selectedSession) {
            setRunTick(t => t + 1);
            if (allTraces) {
              setTraceTick(t => t + 1);
            } else if (data.run_id === selectedRun) {
              setTraceTick(t => t + 1);
            } else if (data.run_id && !selectedRun) {
              setSelectedRun(data.run_id);
            }
          } else if (data.session_id && !selectedSession) {
            setSelectedSession(data.session_id);
          }
        });

        es.onerror = () => {
          setConnected(false);
          es.close();
          retryTimer = setTimeout(connect, 3000);
        };
      } catch {
        setConnected(false);
        retryTimer = setTimeout(connect, 3000);
      }
    }

    connect();
    return () => { clearTimeout(retryTimer); es?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession, selectedRun, allTraces, loadSessions]);

  function handleSelectSession(id: string) {
    setSelectedSession(id);
    setSelectedRun(null);
    setAllTraces(false);
    setSelectedTrace(null);
    setPinnedTrace(null);
    setRunTick(t => t + 1);
  }

  function handleDeletedSession(id: string) {
    setSessions(s => s.filter(x => x.id !== id));
    if (selectedSession === id) {
      setSelectedSession(null);
      setSelectedRun(null);
      setAllTraces(false);
      setSelectedTrace(null);
      setPinnedTrace(null);
    }
  }

  function handleSelectRun(id: string) {
    setSelectedRun(id);
    setAllTraces(false);
    setSelectedTrace(null);
    setTraceTick(t => t + 1);
  }

  function handleSelectAllTraces() {
    setSelectedRun(null);
    setAllTraces(true);
    setSelectedTrace(null);
    setTraceTick(t => t + 1);
  }

  function handleDeletedRun(id: string) {
    if (selectedRun === id) {
      setSelectedRun(null);
      setAllTraces(false);
      setSelectedTrace(null);
    }
    loadSessions();
  }

  async function handleClearAll() {
    if (!confirm('清空所有 session、run 和 trace？')) return;
    await clearAllData();
    setSessions([]);
    setSelectedSession(null);
    setSelectedRun(null);
    setSelectedTrace(null);
  }

  return (
    <SettingsProvider>
    <div className="flex h-screen overflow-hidden bg-gray-950">

      {/* ── Col 1: Sessions ── */}
      <Col label="Sessions" open={col1Open} onToggle={() => setCol1Open(v => !v)} expandedWidth="w-44" btnTop="top-10">
        <SessionSidebar
          sessions={sessions}
          selectedId={selectedSession}
          onSelect={handleSelectSession}
          onDeleted={handleDeletedSession}
          onClearAll={handleClearAll}
          connected={connected}
        />
      </Col>

      {/* ── Col 2: Runs ── */}
      <Col label="Runs" open={col2Open} onToggle={() => setCol2Open(v => !v)} expandedWidth="w-44">
        {selectedSession ? (
          <RunList
            sessionId={selectedSession}
            selectedId={selectedRun}
            allSelected={allTraces}
            onSelect={handleSelectRun}
            onSelectAll={handleSelectAllTraces}
            onDeleted={handleDeletedRun}
            refreshTick={runTick}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-700 text-xs text-center p-4">
            选择 session<br />查看 runs
          </div>
        )}
      </Col>

      {/* ── Col 3: Traces ── */}
      <Col label="Traces" open={col3Open} onToggle={() => setCol3Open(v => !v)} expandedWidth="w-52">
        {selectedRun ? (
          <TraceList
            source={{ type: 'run', runId: selectedRun }}
            selectedId={selectedTrace}
            pinnedId={pinnedTrace}
            onSelect={(id) => { setSelectedTrace(id); setJumpTarget(null); }}
            refreshTick={traceTick}
          />
        ) : allTraces && selectedSession ? (
          <TraceList
            source={{ type: 'session', sessionId: selectedSession }}
            selectedId={selectedTrace}
            pinnedId={pinnedTrace}
            onSelect={(id) => { setSelectedTrace(id); setJumpTarget(null); }}
            refreshTick={traceTick}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-700 text-xs text-center p-4">
            选择 run<br />查看 traces
          </div>
        )}
      </Col>

      {/* ── Col 4: Detail (always visible) ── */}
      <main className="flex-1 overflow-hidden flex flex-col bg-gray-950">
        {selectedTrace ? (
          <TraceDetail
            key={selectedTrace}
            traceId={selectedTrace}
            pinnedTraceId={pinnedTrace}
            onPin={setPinnedTrace}
            jumpTo={jumpTarget}
            onJumpToMessage={(traceId, index) => {
              setJumpTarget({ traceId, index });
              setSelectedTrace(traceId);
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-700">
              <div className="text-4xl mb-3">⬡</div>
              <p className="text-sm">选择 trace 查看详情</p>
              <p className="text-xs mt-1">Code Agent 请求实时出现</p>
            </div>
          </div>
        )}
      </main>
    </div>
    </SettingsProvider>
  );
}
