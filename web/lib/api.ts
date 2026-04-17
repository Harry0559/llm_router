import type { Session, Run, TraceSummary, TraceDetail } from './types';

const BASE = process.env.NEXT_PUBLIC_PROXY_API ?? 'http://localhost:3001';

export async function fetchSessions(): Promise<Session[]> {
  const r = await fetch(`${BASE}/api/sessions`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`sessions: ${r.status}`);
  return r.json() as Promise<Session[]>;
}

export async function fetchRuns(sessionId: string): Promise<Run[]> {
  const r = await fetch(`${BASE}/api/sessions/${sessionId}/runs`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`runs: ${r.status}`);
  return r.json() as Promise<Run[]>;
}

export async function fetchRunTraces(runId: string): Promise<TraceSummary[]> {
  const r = await fetch(`${BASE}/api/runs/${runId}/traces`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`run traces: ${r.status}`);
  return r.json() as Promise<TraceSummary[]>;
}

export async function fetchSessionTraces(sessionId: string): Promise<TraceSummary[]> {
  const r = await fetch(`${BASE}/api/sessions/${sessionId}/traces`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`session traces: ${r.status}`);
  return r.json() as Promise<TraceSummary[]>;
}

export async function fetchTrace(id: string): Promise<TraceDetail> {
  const r = await fetch(`${BASE}/api/traces/${id}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`trace: ${r.status}`);
  return r.json() as Promise<TraceDetail>;
}

export async function deleteSession(id: string): Promise<void> {
  await fetch(`${BASE}/api/sessions/${id}`, { method: 'DELETE' });
}

export async function deleteRun(id: string): Promise<void> {
  await fetch(`${BASE}/api/runs/${id}`, { method: 'DELETE' });
}

export async function clearAllData(): Promise<void> {
  await fetch(`${BASE}/api/data/all`, { method: 'DELETE' });
}

export async function regroupInnerCCOpenAI(): Promise<{ ok: true; sessions: number; runs: number; traces: number }> {
  const r = await fetch(`${BASE}/api/data/regroup-innercc-openai`, { method: 'POST' });
  if (!r.ok) throw new Error(`regroup: ${r.status}`);
  return r.json() as Promise<{ ok: true; sessions: number; runs: number; traces: number }>;
}

export interface TraceBundleExport {
  version: number;
  exported_at: number;
  scope: {
    session_ids: string[];
    run_ids: string[];
    trace_ids: string[];
  };
  counts: {
    sessions: number;
    runs: number;
    traces: number;
  };
  sessions: unknown[];
  runs: unknown[];
  traces: unknown[];
}

export async function updateSessionNotes(id: string, notes: string): Promise<void> {
  await fetch(`${BASE}/api/sessions/${id}/notes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
}

export async function updateRunNotes(id: string, notes: string): Promise<void> {
  await fetch(`${BASE}/api/runs/${id}/notes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
}

export async function updateTraceNotes(id: string, notes: string): Promise<void> {
  await fetch(`${BASE}/api/traces/${id}/notes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
}

export async function exportTraceBundle(params: {
  sessionIds?: string[];
  runIds?: string[];
  traceIds?: string[];
}): Promise<TraceBundleExport> {
  const r = await fetch(`${BASE}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_ids: params.sessionIds ?? [],
      run_ids: params.runIds ?? [],
      trace_ids: params.traceIds ?? [],
    }),
  });
  if (!r.ok) throw new Error(`export: ${r.status}`);
  return r.json() as Promise<TraceBundleExport>;
}

export async function importTraceBundle(bundle: unknown): Promise<{ ok: true; sessions: number; runs: number; traces: number }> {
  const r = await fetch(`${BASE}/api/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bundle),
  });
  if (!r.ok) {
    let message = `import: ${r.status}`;
    try {
      const payload = await r.json() as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // Ignore parse failure.
    }
    throw new Error(message);
  }
  return r.json() as Promise<{ ok: true; sessions: number; runs: number; traces: number }>;
}

export function downloadJsonFile(filename: string, value: unknown): void {
  const text = JSON.stringify(value, null, 2);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function createEventSource(): EventSource {
  return new EventSource(`${BASE}/api/events`);
}
