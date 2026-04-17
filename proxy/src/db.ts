import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  classifyAgentType,
  extractUserAnchors,
  getSyntheticSessionDisplayName,
  InnerCCOpenAITracker,
  isInnerCCOpenAI,
} from './heuristics';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'traces.db');

let _db: Database.Database | null = null;

interface DbSessionRow {
  id: string;
  external_id: string;
  created_at: number;
  updated_at: number;
  run_count: number;
  notes: string | null;
}

interface DbRunRow {
  id: string;
  session_id: string;
  created_at: number;
  updated_at: number;
  trace_count: number;
  notes: string | null;
}

interface DbTraceRow {
  id: string;
  session_id: string;
  run_id: string;
  agent_type: 'main_agent' | 'subagent' | 'title_gen';
  agent: string;
  port: number;
  protocol: string;
  timestamp: number;
  request_method: string;
  request_path: string;
  request_headers: string;
  request_body: string;
  response_status: number;
  response_headers: string;
  response_body: string;
  duration_ms: number;
  model: string;
  tokens_input: number;
  tokens_output: number;
  notes: string | null;
}

function getDb(): Database.Database {
  if (_db) return _db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function isSchemaStale(db: Database.Database): boolean {
  // Check whether the current sessions table has the new external_id column.
  // If not, the DB was created by an older version and must be rebuilt.
  try {
    const cols = db.prepare('PRAGMA table_info(sessions)').all() as { name: string }[];
    if (cols.length === 0) return false; // table doesn't exist yet → fresh DB
    return !cols.some(c => c.name === 'external_id');
  } catch {
    return false;
  }
}

function dropAllTables(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS traces;
    DROP TABLE IF EXISTS runs;
    DROP TABLE IF EXISTS sessions;
  `);
  console.log('[DB] Old schema detected — tables dropped and will be recreated.');
}

function migrateTracesTable(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(traces)').all() as { name: string }[];
  if (cols.length === 0) return; // table not yet created, initSchema will handle it
  if (!cols.some(c => c.name === 'agent_type')) {
    db.exec("ALTER TABLE traces ADD COLUMN agent_type TEXT NOT NULL DEFAULT 'unknown'");
    console.log('[DB] Migrated: added agent_type column to traces');
  }
}

function migrateNotesColumns(db: Database.Database): void {
  const tables = ['sessions', 'runs', 'traces'] as const;
  for (const table of tables) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (cols.length === 0) continue; // not yet created
    if (!cols.some(c => c.name === 'notes')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN notes TEXT`);
      console.log(`[DB] Migrated: added notes column to ${table}`);
    }
  }
}

function initSchema(db: Database.Database): void {
  if (isSchemaStale(db)) dropAllTables(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT    PRIMARY KEY,
      external_id TEXT    NOT NULL UNIQUE,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      run_count   INTEGER NOT NULL DEFAULT 0,
      notes       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_external ON sessions(external_id);

    CREATE TABLE IF NOT EXISTS runs (
      id          TEXT    PRIMARY KEY,
      session_id  TEXT    NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      trace_count INTEGER NOT NULL DEFAULT 0,
      notes       TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_runs_session   ON runs(session_id);
    CREATE INDEX IF NOT EXISTS idx_runs_created   ON runs(created_at DESC);

    CREATE TABLE IF NOT EXISTS traces (
      id               TEXT    PRIMARY KEY,
      session_id       TEXT    NOT NULL,
      run_id           TEXT    NOT NULL,
      agent_type       TEXT    NOT NULL DEFAULT 'unknown',
      agent            TEXT    NOT NULL,
      port             INTEGER NOT NULL,
      protocol         TEXT    NOT NULL,
      timestamp        INTEGER NOT NULL,
      request_method   TEXT,
      request_path     TEXT,
      request_headers  TEXT,
      request_body     TEXT,
      response_status  INTEGER,
      response_headers TEXT,
      response_body    TEXT,
      duration_ms      INTEGER,
      model            TEXT,
      tokens_input     INTEGER,
      tokens_output    INTEGER,
      notes            TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (run_id)     REFERENCES runs(id)     ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_traces_run       ON traces(run_id);
    CREATE INDEX IF NOT EXISTS idx_traces_session   ON traces(session_id);
    CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON traces(timestamp DESC);
  `);

  migrateTracesTable(db);
  migrateNotesColumns(db);
}

function parseJsonField(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function latestAnchorFromRequestBody(rawRequestBody: string | null | undefined): string {
  const body = parseJsonField(rawRequestBody);
  if (!body) return '';
  const anchors = extractUserAnchors(body);
  return anchors[anchors.length - 1] ?? '';
}

function formatAnchorForDisplay(anchor: string): string {
  const normalized = anchor.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'unknown';
  if (normalized.includes('Respond with TEXT ONLY') || normalized.includes('create a detailed summary of the conversation so far')) {
    return 'Compact Summary';
  }
  return normalized.slice(0, 48);
}

function buildSessionDisplayName(db: Database.Database, session: DbSessionRow): string {
  if (session.external_id === '__unknown__') return 'unknown';

  const latestTrace = db.prepare(
    'SELECT request_body FROM traces WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1'
  ).get(session.id) as { request_body: string } | undefined;

  const latestAnchor = latestAnchorFromRequestBody(latestTrace?.request_body);
  const synthetic = getSyntheticSessionDisplayName(session.external_id, latestAnchor);
  if (synthetic) return synthetic;

  return session.external_id.slice(0, 8);
}

function buildRunDisplayName(db: Database.Database, run: DbRunRow): string {
  const firstTrace = db.prepare(
    'SELECT request_body FROM traces WHERE run_id = ? ORDER BY timestamp ASC LIMIT 1'
  ).get(run.id) as { request_body: string } | undefined;

  const anchor = latestAnchorFromRequestBody(firstTrace?.request_body);
  return anchor ? formatAnchorForDisplay(anchor) : 'Run';
}

// ────────── session / run resolution ──────────

// externalId → internal session uuid
const sessionCache = new Map<string, string>();
// internal session uuid → current run uuid
const runCache = new Map<string, string>();

export function resolveSession(externalId: string): string {
  if (sessionCache.has(externalId)) return sessionCache.get(externalId)!;

  const db = getDb();
  const row = db.prepare('SELECT id FROM sessions WHERE external_id = ?').get(externalId) as { id: string } | undefined;
  if (row) {
    sessionCache.set(externalId, row.id);
    return row.id;
  }

  const id = uuidv4();
  const now = Date.now();
  db.prepare(
    'INSERT INTO sessions (id, external_id, created_at, updated_at, run_count) VALUES (?, ?, ?, ?, 0)'
  ).run(id, externalId, now, now);
  sessionCache.set(externalId, id);
  return id;
}

export function resolveRun(sessionId: string, isNewRun: boolean): string {
  const db = getDb();

  // Not a new run: try to return the cached / latest existing run
  if (!isNewRun) {
    const cached = runCache.get(sessionId);
    if (cached) return cached;

    const row = db.prepare(
      'SELECT id FROM runs WHERE session_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(sessionId) as { id: string } | undefined;

    if (row) {
      runCache.set(sessionId, row.id);
      return row.id;
    }
    // No run exists yet → fall through to create one
  }

  // Create a new run
  const id = uuidv4();
  const now = Date.now();
  db.prepare(
    'INSERT INTO runs (id, session_id, created_at, updated_at, trace_count) VALUES (?, ?, ?, ?, 0)'
  ).run(id, sessionId, now, now);
  db.prepare('UPDATE sessions SET updated_at = ?, run_count = run_count + 1 WHERE id = ?')
    .run(now, sessionId);
  runCache.set(sessionId, id);
  return id;
}

// ────────── trace operations ──────────

export interface TraceInsert {
  session_id: string;
  run_id: string;
  agent_type: 'main_agent' | 'subagent' | 'title_gen';
  agent: string;
  port: number;
  protocol: string;
  timestamp: number;
  request_method: string;
  request_path: string;
  request_headers: string;
  request_body: string;
  response_status: number;
  response_headers: string;
  response_body: string;
  duration_ms: number;
  model: string;
  tokens_input: number;
  tokens_output: number;
}

export function insertTrace(t: TraceInsert): string {
  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO traces
      (id, session_id, run_id, agent_type, agent, port, protocol, timestamp,
       request_method, request_path, request_headers, request_body,
       response_status, response_headers, response_body,
       duration_ms, model, tokens_input, tokens_output)
    VALUES (?,?,?,?,?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?,?)
  `).run(
    id, t.session_id, t.run_id, t.agent_type, t.agent, t.port, t.protocol, t.timestamp,
    t.request_method, t.request_path, t.request_headers, t.request_body,
    t.response_status, t.response_headers, t.response_body,
    t.duration_ms, t.model, t.tokens_input, t.tokens_output
  );
  const now = Date.now();
  db.prepare('UPDATE runs     SET updated_at = ?, trace_count = trace_count + 1 WHERE id = ?').run(now, t.run_id);
  db.prepare('UPDATE sessions SET updated_at = ?                                WHERE id = ?').run(now, t.session_id);
  return id;
}

// ────────── query API ──────────

export function querySessions(limit = 200): unknown[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?'
  ).all(limit) as DbSessionRow[];

  return rows.map((session) => ({
    ...session,
    display_name: buildSessionDisplayName(db, session),
  }));
}

export function queryRunsBySession(sessionId: string): unknown[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM runs WHERE session_id = ? ORDER BY created_at ASC'
  ).all(sessionId) as DbRunRow[];

  return rows.map((run) => ({
    ...run,
    display_name: buildRunDisplayName(db, run),
  }));
}

export function queryRunById(id: string): unknown {
  return getDb().prepare('SELECT * FROM runs WHERE id = ?').get(id);
}

export function queryTracesByRun(runId: string): unknown[] {
  return getDb().prepare(`
    SELECT id, session_id, run_id, agent_type, agent, port, protocol, timestamp,
           request_method, request_path, response_status,
           duration_ms, model, tokens_input, tokens_output, notes
    FROM traces WHERE run_id = ? ORDER BY timestamp ASC
  `).all(runId);
}

export function queryTracesBySession(sessionId: string): unknown[] {
  return getDb().prepare(`
    SELECT id, session_id, run_id, agent_type, agent, port, protocol, timestamp,
           request_method, request_path, response_status,
           duration_ms, model, tokens_input, tokens_output, notes
    FROM traces WHERE session_id = ? ORDER BY timestamp ASC
  `).all(sessionId);
}

export function queryTraceById(id: string): unknown {
  return getDb().prepare('SELECT * FROM traces WHERE id = ?').get(id);
}

function getSelectedSessionsAndRuns(params: {
  sessionIds?: string[];
  runIds?: string[];
  traceIds?: string[];
}): { sessions: DbSessionRow[]; runs: DbRunRow[]; traces: DbTraceRow[] } {
  const db = getDb();
  const sessionIds = new Set((params.sessionIds ?? []).filter(Boolean));
  const runIds = new Set((params.runIds ?? []).filter(Boolean));
  const traceIds = new Set((params.traceIds ?? []).filter(Boolean));

  const sessions = new Map<string, DbSessionRow>();
  const runs = new Map<string, DbRunRow>();
  const traces = new Map<string, DbTraceRow>();

  for (const sessionId of sessionIds) {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as DbSessionRow | undefined;
    if (!session) continue;
    sessions.set(session.id, session);

    const sessionRuns = db.prepare('SELECT * FROM runs WHERE session_id = ?').all(sessionId) as DbRunRow[];
    for (const run of sessionRuns) {
      runs.set(run.id, run);
      const runTraces = db.prepare('SELECT * FROM traces WHERE run_id = ? ORDER BY timestamp ASC').all(run.id) as DbTraceRow[];
      for (const trace of runTraces) traces.set(trace.id, trace);
    }
  }

  for (const runId of runIds) {
    const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as DbRunRow | undefined;
    if (!run) continue;
    runs.set(run.id, run);
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(run.session_id) as DbSessionRow | undefined;
    if (session) sessions.set(session.id, session);
    const runTraces = db.prepare('SELECT * FROM traces WHERE run_id = ? ORDER BY timestamp ASC').all(run.id) as DbTraceRow[];
    for (const trace of runTraces) traces.set(trace.id, trace);
  }

  for (const traceId of traceIds) {
    const trace = db.prepare('SELECT * FROM traces WHERE id = ?').get(traceId) as DbTraceRow | undefined;
    if (!trace) continue;
    traces.set(trace.id, trace);
    const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(trace.run_id) as DbRunRow | undefined;
    if (run) runs.set(run.id, run);
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(trace.session_id) as DbSessionRow | undefined;
    if (session) sessions.set(session.id, session);
  }

  return {
    sessions: Array.from(sessions.values()),
    runs: Array.from(runs.values()),
    traces: Array.from(traces.values()).sort((a, b) => a.timestamp - b.timestamp),
  };
}

export function exportTraceBundle(params: {
  sessionIds?: string[];
  runIds?: string[];
  traceIds?: string[];
}): unknown {
  const db = getDb();
  const selected = getSelectedSessionsAndRuns(params);

  const runTraceCounts = new Map<string, number>();
  for (const trace of selected.traces) {
    runTraceCounts.set(trace.run_id, (runTraceCounts.get(trace.run_id) ?? 0) + 1);
  }

  const sessionRunCounts = new Map<string, number>();
  for (const run of selected.runs) {
    sessionRunCounts.set(run.session_id, (sessionRunCounts.get(run.session_id) ?? 0) + 1);
  }

  const sessions = selected.sessions
    .map((session) => ({
      ...session,
      run_count: sessionRunCounts.get(session.id) ?? 0,
      display_name: buildSessionDisplayName(db, session),
    }))
    .sort((a, b) => a.created_at - b.created_at);

  const runs = selected.runs
    .map((run) => ({
      ...run,
      trace_count: runTraceCounts.get(run.id) ?? 0,
      display_name: buildRunDisplayName(db, run),
    }))
    .sort((a, b) => a.created_at - b.created_at);

  return {
    version: 1,
    exported_at: Date.now(),
    scope: {
      session_ids: params.sessionIds ?? [],
      run_ids: params.runIds ?? [],
      trace_ids: params.traceIds ?? [],
    },
    counts: {
      sessions: sessions.length,
      runs: runs.length,
      traces: selected.traces.length,
    },
    sessions,
    runs,
    traces: selected.traces,
  };
}

function dbIsEmpty(db: Database.Database): boolean {
  const sessionCount = (db.prepare('SELECT COUNT(*) AS c FROM sessions').get() as { c: number }).c;
  const runCount = (db.prepare('SELECT COUNT(*) AS c FROM runs').get() as { c: number }).c;
  const traceCount = (db.prepare('SELECT COUNT(*) AS c FROM traces').get() as { c: number }).c;
  return sessionCount === 0 && runCount === 0 && traceCount === 0;
}

export function importTraceBundle(rawBundle: unknown): { sessions: number; runs: number; traces: number } {
  const bundle = rawBundle as {
    version?: number;
    sessions?: DbSessionRow[];
    runs?: DbRunRow[];
    traces?: DbTraceRow[];
  };

  if (bundle.version !== 1) {
    throw new Error('unsupported bundle version');
  }

  const sessions = Array.isArray(bundle.sessions) ? bundle.sessions : [];
  const runs = Array.isArray(bundle.runs) ? bundle.runs : [];
  const traces = Array.isArray(bundle.traces) ? bundle.traces : [];

  const db = getDb();
  if (!dbIsEmpty(db)) {
    throw new Error('import only allowed into an empty database');
  }

  const insertSession = db.prepare(
    'INSERT INTO sessions (id, external_id, created_at, updated_at, run_count, notes) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertRun = db.prepare(
    'INSERT INTO runs (id, session_id, created_at, updated_at, trace_count, notes) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertTrace = db.prepare(`
    INSERT INTO traces
      (id, session_id, run_id, agent_type, agent, port, protocol, timestamp,
       request_method, request_path, request_headers, request_body,
       response_status, response_headers, response_body,
       duration_ms, model, tokens_input, tokens_output, notes)
    VALUES (?,?,?,?,?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?,?, ?)
  `);

  const tx = db.transaction(() => {
    for (const session of sessions) {
      insertSession.run(
        session.id,
        session.external_id,
        session.created_at,
        session.updated_at,
        session.run_count,
        session.notes ?? null,
      );
    }

    for (const run of runs) {
      insertRun.run(
        run.id,
        run.session_id,
        run.created_at,
        run.updated_at,
        run.trace_count,
        run.notes ?? null,
      );
    }

    for (const trace of traces) {
      insertTrace.run(
        trace.id,
        trace.session_id,
        trace.run_id,
        trace.agent_type,
        trace.agent,
        trace.port,
        trace.protocol,
        trace.timestamp,
        trace.request_method,
        trace.request_path,
        trace.request_headers,
        trace.request_body,
        trace.response_status,
        trace.response_headers,
        trace.response_body,
        trace.duration_ms,
        trace.model,
        trace.tokens_input,
        trace.tokens_output,
        trace.notes ?? null,
      );
    }
  });

  tx();
  sessionCache.clear();
  runCache.clear();

  return {
    sessions: sessions.length,
    runs: runs.length,
    traces: traces.length,
  };
}

export function regroupInnerCCOpenAIUnknownTraces(): { sessions: number; runs: number; traces: number } {
  const db = getDb();
  const rows = db.prepare(`
    SELECT t.*, s.external_id AS session_external_id
    FROM traces t
    JOIN sessions s ON s.id = t.session_id
    WHERE t.protocol = 'openai'
      AND s.external_id = '__unknown__'
    ORDER BY t.timestamp ASC
  `).all() as Array<DbTraceRow & { session_external_id: string }>;

  const tracker = new InnerCCOpenAITracker();
  const targetTraces: Array<DbTraceRow & { new_session_id: string; new_run_id: string; new_agent_type: DbTraceRow['agent_type']; external_session_id: string }> = [];
  const syntheticSessions = new Map<string, DbSessionRow>();
  const syntheticRuns = new Map<string, DbRunRow>();
  const currentRunByExternalSession = new Map<string, string>();
  const oldSessionIds = new Set<string>();
  const oldRunIds = new Set<string>();

  for (const row of rows) {
    const body = parseJsonField(row.request_body);
    if (!body || !isInnerCCOpenAI(body, 'openai')) continue;

    oldSessionIds.add(row.session_id);
    oldRunIds.add(row.run_id);

    const externalSessionId = tracker.resolveSessionSignal(body, 'openai', row.timestamp);
    const agentType = classifyAgentType(body);
    const isNewRun = tracker.resolveRunSignal(body, 'openai', externalSessionId, row.timestamp);

    let session = syntheticSessions.get(externalSessionId);
    if (!session) {
      session = {
        id: uuidv4(),
        external_id: externalSessionId,
        created_at: row.timestamp,
        updated_at: row.timestamp,
        run_count: 0,
        notes: null,
      };
      syntheticSessions.set(externalSessionId, session);
    }
    session.updated_at = row.timestamp;

    let runId = currentRunByExternalSession.get(externalSessionId) ?? null;
    if (!runId || isNewRun) {
      const run = {
        id: uuidv4(),
        session_id: session.id,
        created_at: row.timestamp,
        updated_at: row.timestamp,
        trace_count: 0,
        notes: null,
      };
      syntheticRuns.set(run.id, run);
      currentRunByExternalSession.set(externalSessionId, run.id);
      session.run_count += 1;
      runId = run.id;
    }

    const run = syntheticRuns.get(runId)!;
    run.updated_at = row.timestamp;
    run.trace_count += 1;

    targetTraces.push({
      ...row,
      new_session_id: session.id,
      new_run_id: run.id,
      new_agent_type: agentType,
      external_session_id: externalSessionId,
    });
  }

  if (targetTraces.length === 0) {
    return { sessions: 0, runs: 0, traces: 0 };
  }

  const insertSession = db.prepare(
    'INSERT INTO sessions (id, external_id, created_at, updated_at, run_count, notes) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertRun = db.prepare(
    'INSERT INTO runs (id, session_id, created_at, updated_at, trace_count, notes) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const updateTrace = db.prepare(
    'UPDATE traces SET session_id = ?, run_id = ?, agent_type = ? WHERE id = ?'
  );
  const deleteRunStmt = db.prepare('DELETE FROM runs WHERE id = ?');
  const deleteSessionStmt = db.prepare('DELETE FROM sessions WHERE id = ?');

  const tx = db.transaction(() => {
    for (const session of syntheticSessions.values()) {
      insertSession.run(
        session.id,
        session.external_id,
        session.created_at,
        session.updated_at,
        session.run_count,
        session.notes ?? null,
      );
    }

    for (const run of syntheticRuns.values()) {
      insertRun.run(
        run.id,
        run.session_id,
        run.created_at,
        run.updated_at,
        run.trace_count,
        run.notes ?? null,
      );
    }

    for (const trace of targetTraces) {
      updateTrace.run(trace.new_session_id, trace.new_run_id, trace.new_agent_type, trace.id);
    }

    for (const runId of oldRunIds) {
      const count = (db.prepare('SELECT COUNT(*) AS c FROM traces WHERE run_id = ?').get(runId) as { c: number }).c;
      if (count === 0) deleteRunStmt.run(runId);
    }

    for (const sessionId of oldSessionIds) {
      const count = (db.prepare('SELECT COUNT(*) AS c FROM traces WHERE session_id = ?').get(sessionId) as { c: number }).c;
      if (count === 0) deleteSessionStmt.run(sessionId);
    }
  });

  tx();
  sessionCache.clear();
  runCache.clear();

  return {
    sessions: syntheticSessions.size,
    runs: syntheticRuns.size,
    traces: targetTraces.length,
  };
}

// ────────── notes update ──────────

export function updateSessionNotes(id: string, notes: string): void {
  getDb().prepare('UPDATE sessions SET notes = ? WHERE id = ?').run(notes || null, id);
}

export function updateRunNotes(id: string, notes: string): void {
  getDb().prepare('UPDATE runs SET notes = ? WHERE id = ?').run(notes || null, id);
}

export function updateTraceNotes(id: string, notes: string): void {
  getDb().prepare('UPDATE traces SET notes = ? WHERE id = ?').run(notes || null, id);
}

// ────────── delete / clear ──────────

export function deleteSession(id: string): void {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
  // Remove from caches
  for (const [extId, sessId] of sessionCache) {
    if (sessId === id) { sessionCache.delete(extId); break; }
  }
  for (const [sessId] of runCache) {
    if (sessId === id) { runCache.delete(sessId); break; }
  }
}

export function deleteRun(id: string): void {
  const db = getDb();
  const row = db.prepare('SELECT session_id FROM runs WHERE id = ?').get(id) as { session_id: string } | undefined;
  db.prepare('DELETE FROM runs WHERE id = ?').run(id);
  if (row) {
    db.prepare('UPDATE sessions SET run_count = MAX(0, run_count - 1) WHERE id = ?').run(row.session_id);
    // Invalidate run cache for this session so next trace creates a new run
    runCache.delete(row.session_id);
  }
}

export function clearAll(): void {
  const db = getDb();
  db.prepare('DELETE FROM traces').run();
  db.prepare('DELETE FROM runs').run();
  db.prepare('DELETE FROM sessions').run();
  sessionCache.clear();
  runCache.clear();
}
