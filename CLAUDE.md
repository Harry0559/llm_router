# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm install && npm run install:all   # Install all dependencies (root + proxy + web)
npm run dev           # Start proxy server and web UI concurrently
npm run dev:proxy     # Start proxy server only (proxy :7878 + API :3001)
npm run dev:web       # Start web UI only (port 3000)
```

### Proxy server
```bash
cd proxy
npm run dev           # ts-node-dev with hot reload
npm run build         # Compile TypeScript → dist/
npm run start         # Run compiled output
```

### Web UI
```bash
cd web
npm run dev           # Next.js dev server on :3000
npm run build         # Production build
npm run start         # Production server
```

No linting or test suite is currently configured.

## Architecture

This is a monorepo with two packages: `proxy/` (Node/TypeScript backend) and `web/` (Next.js frontend).

### Environment

`LLM_UPSTREAM_URL` must be set before starting the proxy (e.g. `export LLM_UPSTREAM_URL=https://api.anthropic.com`). The proxy will exit immediately if this is missing.

### Request flow

```
Code Agents → proxy :7878 → proxyHandler.ts (strips hop-by-hop headers, forwards)
                          → LLM_UPSTREAM_URL (any Anthropic/OpenAI-compatible endpoint)
                          → streamAssembler.ts (reassembles SSE into complete JSON)
                          → db.ts (persists trace + session in SQLite)
                          → broadcast.ts (SSE push to browser)
                          → web UI :3000 (sessions / traces / detail)
```

The proxy is **transparent** — forwards verbatim (minus hop-by-hop headers), no model rewriting, no credential injection.

**Protocol detection** is by request path: `/v1/messages` → Anthropic, `/v1/chat/completions` → OpenAI. All other paths are forwarded transparently without tracing.

### Proxy (`proxy/src/`)

| File | Role |
|---|---|
| `index.ts` | Entry point; starts proxy (:7878) and API (:3001) servers |
| `config.ts` | Reads `LLM_UPSTREAM_URL`; defines `PROXY_PORT` and `API_SERVER_PORT` |
| `proxyHandler.ts` | Single Express app; routes by path to Anthropic or OpenAI handler; transparent fallback for all other routes |
| `apiServer.ts` | REST + SSE API for web UI (`/api/sessions`, `/api/sessions/:id/traces`, `/api/traces/:id`, `/api/events`, `DELETE /api/data/all`) |
| `db.ts` | SQLite schema, session tracking (10-min inactivity timeout, in-memory state resets on restart), trace persistence |
| `streamAssembler.ts` | Reconstructs Anthropic and OpenAI SSE streams into structured JSON |
| `broadcast.ts` | Maintains SSE connections; emits `new_trace` events |

Database is a SQLite file at `proxy/data/traces.db` (gitignored, auto-created on startup).

**Session grouping**: sessions are grouped by protocol (`anthropic` / `openai`); requests within 10 minutes of the previous one share a session.

### Web UI (`web/`)

Single-page Next.js app (App Router). `app/page.tsx` is the entire dashboard — three-column layout rendered client-side:

1. **Left** — `SessionSidebar.tsx`: color-coded by agent, delete/clear controls
2. **Middle** — `TraceList.tsx`: traces in the selected session, sorted by timestamp
3. **Right** — `TraceDetail.tsx`: tabbed view (Messages, Response, JSON, Headers, Tokens)

`lib/api.ts` handles all HTTP calls and maintains the SSE `EventSource` connection. Types shared between components live in `lib/types.ts`.
