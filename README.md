# Baby Album

Open source baby photo platform for self-hosted households. The current test build focuses on four end-to-end flows:

- mobile-first photo timeline and manual upload
- album onboarding with registration, login, album creation, and baby profiles
- album RBAC with invite links and role management
- cloud control plane plus NAS agent with outbound-only coordination

## Repository layout

- `apps/web`: Next.js mobile-first PWA shell for timeline, uploads, onboarding, members, and settings
- `services/api`: Go control plane API with PostgreSQL persistence, auth sessions, invite flows, blob-cache-backed upload ingestion, health checks, and configurable CORS allow-lists
- `services/agent`: Go NAS connector that registers, heartbeats, polls jobs, downloads original blobs from the API, generates previews for supported images, and stores originals locally
- `docs/architecture.md`: architecture and data-flow notes
- `docs/test-deploy.md`: single-VM test deployment guide
- `docs/vps-deploy.md`: Ubuntu + Docker + Nginx Proxy Manager + Cloudflare guide
- `docker-compose.npm.yml`: override that joins `web` and `api` to an external `npm_net`

## Quick start

1. Copy `.env.example` to `.env`
2. Start PostgreSQL with Docker Compose or your local Postgres instance
3. Run the API with `DATABASE_URL` pointed at Postgres
4. Run the agent against the API
5. Install web dependencies in `apps/web` and start the Next.js app

## Local development

```powershell
# terminal 1
cd E:\qinbaobao\services\api
$env:DATABASE_URL='postgres://baby_album:baby_album@localhost:5432/baby_album?sslmode=disable'
$env:CACHE_ROOT='E:\qinbaobao\tmp\cache'
$env:ALLOWED_ORIGINS='http://localhost:3000'
& 'C:\Program Files\Go\bin\go.exe' run .\cmd\server

# terminal 2
cd E:\qinbaobao\services\agent
$env:AGENT_API_BASE_URL='http://localhost:8080'
$env:AGENT_LIBRARY_ROOT='E:\qinbaobao\tmp\library'
& 'C:\Program Files\Go\bin\go.exe' run .\cmd\agent

# terminal 3
cd E:\qinbaobao\apps\web
npm.cmd run dev
```

## One-command local start

```bash
./scripts/dev-up.sh 192.168.31.200
```

This starts:

- PostgreSQL via Docker Compose
- the Go API on `:8080`
- the Next.js web app on `:3000`

If you also want the NAS agent to start, pass pairing or node credentials in the same shell first:

```bash
export AGENT_PAIRING_CODE='12345678'
./scripts/dev-up.sh 192.168.31.200
```

Stop everything with:

```bash
./scripts/dev-down.sh
```

## Browser smoke tests

Run the Playwright main-flow suite against a local stack:

```bash
./scripts/test-e2e.sh
```

The script starts PostgreSQL, API, web, and a demo agent-compatible setup, then runs the browser tests in `apps/web/e2e`.

## Single-host test deployment

The repository already supports a simple single-VM test deployment:

1. Copy `.env.example` to `.env`
2. Set `NEXT_PUBLIC_API_BASE_URL` to your public API domain
3. Set `ALLOWED_ORIGINS` to your public web domain
4. If your VPS already uses common ports, set `WEB_PORT`, `API_PORT`, and `POSTGRES_PORT` in `.env` before running Docker Compose
5. If Nginx Proxy Manager runs in Docker, start with `docker compose -f docker-compose.yml -f docker-compose.npm.yml up --build -d`
6. Otherwise, run `docker compose up --build -d`
7. Put the published web and API host ports behind your reverse proxy, or proxy to the shared Docker network directly when using NPM

For a fuller VPS guide built around Nginx Proxy Manager and Cloudflare, use [docs/vps-deploy.md](docs/vps-deploy.md).

## Operational notes

- The API now emits structured JSON logs with `request_id`, path, status, duration, user, and album context.
- The web app reports unhandled runtime errors to `POST /api/v1/client-errors`, which writes them to the API logs.
- The PWA service worker now caches static shell assets and prompts when a new version is ready.

## Upload and processing flow

1. The web app creates an upload session with metadata only.
2. The browser uploads the actual file to `POST /api/v1/upload-sessions/{id}/content`.
3. The API stores the file in its local blob cache and marks the session as `uploaded`.
4. The API enqueues an ingest job for the assigned NAS node.
5. The NAS agent polls jobs and downloads the original blob from `GET /api/v1/agents/jobs/{id}/blob?nodeId=...`.
6. The NAS agent stores the original file in its own library root.
7. For supported images, the NAS agent generates a JPEG thumbnail and uploads it back to `POST /api/v1/agents/jobs/{id}/preview?nodeId=...`.
8. The NAS agent completes the job with width, height, preview status, preview blob key, and original-path metadata.

## NAS pairing and storage reporting

1. An album owner or admin generates a NAS pairing code from the web control panel.
2. The first-time NAS deployment sets `AGENT_API_BASE_URL`, `AGENT_PAIRING_CODE`, `AGENT_NODE_NAME`, and `AGENT_LIBRARY_ROOT`.
3. The agent registers with `POST /api/v1/storage-nodes/register`, and the control plane creates a storage-node record bound to that album.
4. The control plane returns a dedicated `nodeId` and `nodeToken`; the agent saves them to `.agent-state.json` under `AGENT_LIBRARY_ROOT`.
5. Subsequent restarts and heartbeats reuse the saved node credentials and report `total/free/available` bytes from the NAS filesystem.
6. The web control panel reads the latest capacity numbers from the active album's storage node and shows remaining space.

## Agent Docker Compose

The recommended NAS startup path is now Docker Compose, because the agent container includes `ffmpeg` for video poster generation.

1. Generate a pairing code in the web control panel
2. Run:

```bash
./scripts/agent-init.sh \
  --api-base-url http://192.168.31.200:8080 \
  --pairing-code ABC123 \
  --node-name "Living Room NAS" \
  --library-path /volume1/baby-album/library
```

3. Start the agent:

```bash
cd deploy/agent
docker compose up --build -d
```

The deployment now uses:

- a mounted library directory for originals and `.agent-state.json`
- a mounted `config/agent.json` for user-facing setup values
- a minimal `.env` for host paths and heartbeat interval

If `config/agent.json` is missing and you start the container with an attached terminal, the agent will enter an interactive setup wizard and write the config file for you. After setup, future runs can use `docker compose up -d` directly.

## Production note

The current implementation no longer depends on a shared filesystem between the cloud control plane and the NAS. The API cache currently uses local disk on the cloud host, which is fine for the first test deployment. Later, the same blob-key model can be swapped to object storage without changing the agent protocol.
