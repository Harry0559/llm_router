import express from 'express';
import cors from 'cors';
import { addSseClient } from './broadcast';
import {
  querySessions,
  queryRunsBySession,
  queryTracesByRun,
  queryTracesBySession,
  queryTraceById,
  deleteSession,
  deleteRun,
  clearAll,
  updateSessionNotes,
  updateRunNotes,
  updateTraceNotes,
} from './db';

export function createApiApp(): express.Application {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ── SSE: real-time events ──────────────────────────────────────────────
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const ping = setInterval(() => {
      try { res.write(':ping\n\n'); } catch { clearInterval(ping); }
    }, 25_000);

    req.on('close', () => clearInterval(ping));
    addSseClient(res);
  });

  // ── Sessions ───────────────────────────────────────────────────────────
  app.get('/api/sessions', (_req, res) => {
    res.json(querySessions(200));
  });

  app.delete('/api/sessions/:id', (req, res) => {
    deleteSession(req.params.id);
    res.json({ ok: true });
  });

  app.patch('/api/sessions/:id/notes', (req, res) => {
    const { notes } = req.body as { notes: string };
    updateSessionNotes(req.params.id, notes ?? '');
    res.json({ ok: true });
  });

  // ── Runs ───────────────────────────────────────────────────────────────
  app.get('/api/sessions/:id/runs', (req, res) => {
    res.json(queryRunsBySession(req.params.id));
  });

  app.delete('/api/runs/:id', (req, res) => {
    deleteRun(req.params.id);
    res.json({ ok: true });
  });

  app.patch('/api/runs/:id/notes', (req, res) => {
    const { notes } = req.body as { notes: string };
    updateRunNotes(req.params.id, notes ?? '');
    res.json({ ok: true });
  });

  // ── Traces ─────────────────────────────────────────────────────────────
  app.get('/api/runs/:id/traces', (req, res) => {
    res.json(queryTracesByRun(req.params.id));
  });

  // kept for compatibility
  app.get('/api/sessions/:id/traces', (req, res) => {
    res.json(queryTracesBySession(req.params.id));
  });

  app.get('/api/traces/:id', (req, res) => {
    const trace = queryTraceById(req.params.id);
    if (!trace) return res.status(404).json({ error: 'not found' });
    return res.json(trace);
  });

  app.patch('/api/traces/:id/notes', (req, res) => {
    const { notes } = req.body as { notes: string };
    updateTraceNotes(req.params.id, notes ?? '');
    res.json({ ok: true });
  });

  // ── Admin ──────────────────────────────────────────────────────────────
  app.delete('/api/data/all', (_req, res) => {
    clearAll();
    res.json({ ok: true });
  });

  return app;
}
