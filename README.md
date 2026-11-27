# Coauthor

A real-time collaborative document editor (think a small Google Docs). Several people edit the same document at once, see each other's cursors, and never lose work to conflicts. Documents have owners, editors and viewers, and every document keeps a restorable version history.

**Stack:** React · TipTap (ProseMirror) · Yjs (CRDT) · Node.js + `ws` · PostgreSQL · Redis · Docker · GitHub Actions

## Features

| | |
|---|---|
| Live co-editing | Rich text (headings, lists, quotes, code) synced over WebSockets with Yjs CRDTs, so concurrent edits merge deterministically |
| Presence | Coloured live cursors with name labels, avatar list of who is in the document |
| Auth | Email/password, bcrypt hashing, JWT sessions, rate-limited login |
| Sharing | Owner / editor / viewer roles enforced **on the server**; changing or revoking a role takes effect on live sessions immediately |
| Version history | Autosaves plus named versions; preview and restore. Restoring is a normal CRDT edit, so it syncs to everyone and is itself undoable |
| Persistence | Debounced writes of the Yjs state to Postgres; state is merged on write |
| Horizontal scaling | Optional Redis pub/sub relays document updates and presence between server instances |
| Ops | Dockerfiles, `docker compose` stack, health check, CI that runs tests and builds images |

## Architecture

```
 Browser (React + TipTap + Yjs)
     │  REST /api/*  (JWT)           WebSocket /collab/:docId?token=…  (y-websocket protocol)
     ▼                                         ▼
 ┌───────────────────── nginx (static SPA + reverse proxy) ─────────────────────┐
 └───────────────┬───────────────────────────────────────────────┬─────────────┘
                 ▼                                               ▼
        Node server #1  ◄──── Redis pub/sub (updates, presence) ────►  Node server #2
        Room = Y.Doc + awareness per open document
                 └──────────────────────────┬──────────────────────────┘
                                            ▼
                                       PostgreSQL
                      users · documents(ydoc bytea) · doc_members · doc_versions
```

### Design decisions worth talking about

- **Why CRDTs (Yjs) instead of Operational Transform?** No central transform server is needed. Updates commute, so they can arrive in any order, be applied twice, or come via a different server and still converge. That is what makes the Redis fan-out and the merge-on-write persistence safe.
- **Read-only enforcement is server-side.** Viewers may send sync step 1 (to *receive* the document) and awareness (cursors), but any message that would write to the document is dropped. Hiding the toolbar is only cosmetic.
- **Multi-instance safety.** Each instance persists inside a transaction with `SELECT … FOR UPDATE`, merges the stored state into memory, then writes the union. Two servers saving the same document cannot overwrite each other.
- **Restore without rewinding.** Rolling a CRDT back is not possible, so a restore replaces the document's content in one transaction using the old version's nodes. Concurrent editors keep working, and a "Before restore" safety version is stored first.
- **Access changes are live.** Changing or removing a member closes their sockets; the client reconnects, is re-authorised, and either gets the new role or is refused.

## Run it

### Docker (one command)

```bash
cp .env.example .env            # set JWT_SECRET and POSTGRES_PASSWORD
docker compose up --build       # http://localhost:8080
docker compose up --build --scale server=2   # two collaboration servers sharing Redis
```

### Local development

```bash
# needs Postgres and (optionally) Redis running locally
createdb coauthor
cd server && npm install && DATABASE_URL=postgres://localhost/coauthor npm run dev
cd client && npm install && npm run dev      # http://localhost:5173 (proxies /api and /collab)
```

### Tests

```bash
createdb coauthor_test
cd server && DATABASE_URL=postgres://localhost/coauthor_test REDIS_URL=redis://localhost:6379 npm test
```

The tests use real WebSocket clients and cover: auth validation, permissions, two-editor convergence, viewer write rejection, presence, persistence across disconnects, version restore reaching live clients, access revocation, and **two server processes sharing a document via Redis**.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | local Postgres | |
| `JWT_SECRET` | dev value | **Required** when `NODE_ENV=production` |
| `REDIS_URL` | empty | Set to enable multi-instance relay |
| `CORS_ORIGIN` | empty | Comma-separated origins, only if the SPA is on another domain |
| `PERSIST_DEBOUNCE_MS` | `1500` | Delay before saving after an edit |
| `AUTO_VERSION_MS` | `600000` | Minimum gap between autosave versions |

## Deploying

The app is two containers (`server`, `web`) plus Postgres and Redis, so it runs on any Docker host.

- **VPS (simplest):** `docker compose up -d --build` behind Caddy or Cloudflare for HTTPS (WebSockets pass through both).
- **Render / Railway / Fly.io:** deploy `server/` and `client/` as two services, attach managed Postgres (and Redis for >1 instance). Set `JWT_SECRET`. Serve the client and proxy `/api` and `/collab` to the server through the `web` service, or set `VITE_PROXY` and host the SPA separately with a rewrite rule.
- Use HTTPS in production: the client automatically switches to `wss://`.

## Known limitations and next steps

- The WebSocket auth token is sent in the query string. Production hardening: issue short-lived, single-use WebSocket tickets from an authenticated endpoint.
- Document titles are saved on blur and not live-synced; moving the title into a `Y.Map` would fix that.
- Version snapshots store full state; compact them (or store diffs) for very large documents.
- Ideas: comments and suggestions, share-by-link, image upload, per-document rate limits, Prometheus metrics, Playwright E2E in CI.

## Resume bullets

- Built a real-time collaborative rich-text editor (React, TipTap, Yjs CRDTs, Node.js WebSockets) supporting concurrent editing, live cursors and role-based sharing.
- Designed a horizontally scalable sync tier: Redis pub/sub relays updates between server instances, with transactional merge-on-write persistence to PostgreSQL.
- Implemented server-enforced RBAC (owner/editor/viewer) with live revocation, JWT auth, rate limiting and a CRDT-safe version history with one-click restore.
- Shipped with Docker Compose, GitHub Actions CI and an integration suite that drives real WebSocket clients, including a two-process Redis scaling test.
