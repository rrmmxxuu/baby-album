# Baby Album

Open source baby photo platform for self-hosted families. The current test build focuses on four end-to-end flows:

- mobile-first photo timeline and manual upload
- family onboarding with registration, login, family creation, and baby profiles
- family RBAC with invite links and role management
- cloud control plane plus NAS agent with outbound-only coordination

## Repository layout

- `apps/web`: Next.js mobile-first PWA shell for timeline, uploads, onboarding, members, and settings
- `services/api`: Go control plane API with PostgreSQL persistence, auth sessions, invite flows, and blob-cache-backed upload ingestion
- `services/agent`: Go NAS connector that registers, heartbeats, polls jobs, downloads original blobs from the API, generates previews for supported images, and stores originals locally
- `docs/architecture.md`: architecture and data-flow notes
- `docs/test-deploy.md`: single-VM test deployment guide

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

## Single-host test deployment

The repository already supports a simple single-VM test deployment:

1. Copy `.env.example` to `.env`
2. Run `docker compose up --build -d`
3. Expose ports `3000` and `8080`, or place them behind a reverse proxy
4. Pair the NAS agent to the public API URL when you move the agent off the same host

For a fuller production-style checklist, use [docs/test-deploy.md](docs/test-deploy.md).

## Upload and processing flow

1. The web app creates an upload session with metadata only.
2. The browser uploads the actual file to `POST /api/v1/upload-sessions/{id}/content`.
3. The API stores the file in its local blob cache and marks the session as `uploaded`.
4. The API enqueues an ingest job for the assigned NAS node.
5. The NAS agent polls jobs and downloads the original blob from `GET /api/v1/agents/jobs/{id}/blob?nodeId=...`.
6. The NAS agent stores the original file in its own library root.
7. For supported images, the NAS agent generates a JPEG thumbnail and uploads it back to `POST /api/v1/agents/jobs/{id}/preview?nodeId=...`.
8. The NAS agent completes the job with width, height, preview status, preview blob key, and original-path metadata.

## Production note

The current implementation no longer depends on a shared filesystem between the cloud control plane and the NAS. The API cache currently uses local disk on the cloud host, which is fine for the first test deployment. Later, the same blob-key model can be swapped to object storage without changing the agent protocol.