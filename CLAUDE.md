# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm run install:all   # Install all dependencies (proxy + web)
npm run dev           # Start proxy server and web UI concurrently
npm run dev:proxy     # Start proxy server only (ports 7878/7879/7880 + API :3001)
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

### Request flow

```
Code Agents (Claude Code :7878, Free Code :7879, Test Code :7880)
  → proxyHandler.ts   (intercepts, strips auth, overrides model, forwards)
  → Volcano API       (glm-4.7, Anthropic + OpenAI protocol endpoints)
  → streamAssembler.ts (reassembles SSE chunks into complete JSON)
  → db.ts             (persists trace + updates session in SQLite)
  → broadcast.ts      (SSE push to connected web clients)
  → web UI            (three-column dashboard: sessions / traces / detail)
```

### Proxy (`proxy/src/`)

| File | Role |
|---|---|
| `index.ts` | Entry point; starts proxy and API servers |
| `config.ts` | All constants: agent ports, Volcano API endpoints/key, default model |
| `proxyHandler.ts` | Core routing; handles Anthropic and OpenAI protocols; streams responses back to agents |
| `apiServer.ts` | REST + SSE API consumed by the web UI (`/api/sessions`, `/api/traces`, `/api/events`) |
| `db.ts` | SQLite schema init, session tracking (10-min inactivity timeout), trace persistence |
| `streamAssembler.ts` | Reconstructs both Anthropic and OpenAI server-sent event streams into structured JSON |
| `broadcast.ts` | Maintains SSE connections; emits `new_trace` events |

Database is a SQLite file at `proxy/data/traces.db` (gitignored, auto-created on startup).

**Session grouping**: requests from the same agent within 10 minutes of the previous request are grouped into the same session.

**Model override**: all upstream requests have their model replaced with `glm-4.7` regardless of what the agent sends.

### Web UI (`web/`)

Single-page Next.js app (App Router). `app/page.tsx` is the entire dashboard — three-column layout rendered client-side:

1. **Left** — `SessionSidebar.tsx`: color-coded by agent, delete/clear controls
2. **Middle** — `TraceList.tsx`: traces in the selected session, sorted by timestamp
3. **Right** — `TraceDetail.tsx`: tabbed view (Messages, Response, JSON, Headers, Tokens)

`lib/api.ts` handles all HTTP calls and maintains the SSE `EventSource` connection. Types shared between components live in `lib/types.ts`.
