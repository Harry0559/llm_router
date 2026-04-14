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

export function createEventSource(): EventSource {
  return new EventSource(`${BASE}/api/events`);
}
