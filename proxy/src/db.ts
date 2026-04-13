import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'traces.db');

let _db: Database.Database | null = null;

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

function initSchema(db: Database.Database): void {
  if (isSchemaStale(db)) dropAllTables(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT    PRIMARY KEY,
      external_id TEXT    NOT NULL UNIQUE,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      run_count   INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_external ON sessions(external_id);

    CREATE TABLE IF NOT EXISTS runs (
      id          TEXT    PRIMARY KEY,
      session_id  TEXT    NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      trace_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_runs_session   ON runs(session_id);
    CREATE INDEX IF NOT EXISTS idx_runs_created   ON runs(created_at DESC);

    CREATE TABLE IF NOT EXISTS traces (
      id               TEXT    PRIMARY KEY,
      session_id       TEXT    NOT NULL,
      run_id           TEXT    NOT NULL,
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
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (run_id)     REFERENCES runs(id)     ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_traces_run       ON traces(run_id);
    CREATE INDEX IF NOT EXISTS idx_traces_session   ON traces(session_id);
    CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON traces(timestamp DESC);
  `);
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
      (id, session_id, run_id, agent, port, protocol, timestamp,
       request_method, request_path, request_headers, request_body,
       response_status, response_headers, response_body,
       duration_ms, model, tokens_input, tokens_output)
    VALUES (?,?,?,?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?,?)
  `).run(
    id, t.session_id, t.run_id, t.agent, t.port, t.protocol, t.timestamp,
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
  return getDb().prepare(
    'SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?'
  ).all(limit);
}

export function queryRunsBySession(sessionId: string): unknown[] {
  return getDb().prepare(
    'SELECT * FROM runs WHERE session_id = ? ORDER BY created_at ASC'
  ).all(sessionId);
}

export function queryTracesByRun(runId: string): unknown[] {
  return getDb().prepare(`
    SELECT id, session_id, run_id, agent, port, protocol, timestamp,
           request_method, request_path, response_status,
           duration_ms, model, tokens_input, tokens_output
    FROM traces WHERE run_id = ? ORDER BY timestamp ASC
  `).all(runId);
}

export function queryTracesBySession(sessionId: string): unknown[] {
  return getDb().prepare(`
    SELECT id, session_id, run_id, agent, port, protocol, timestamp,
           request_method, request_path, response_status,
           duration_ms, model, tokens_input, tokens_output
    FROM traces WHERE session_id = ? ORDER BY timestamp ASC
  `).all(sessionId);
}

export function queryTraceById(id: string): unknown {
  return getDb().prepare('SELECT * FROM traces WHERE id = ?').get(id);
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
