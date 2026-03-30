# Test Deployment Guide

[中文版](test-deploy.zh-CN.md)

This guide is for the first public test deployment of Baby Album on a single cloud VM.

## Topology

- `web`: public Next.js frontend
- `api`: public Go control plane
- `postgres`: API persistence
- `agent`: optional on the same host for smoke tests; in a real test, run it on a NAS or home server

## Recommended first deployment

- VM: 2 vCPU, 4 GB RAM, 40 GB SSD
- OS: Ubuntu 24.04 LTS or Debian 12
- Reverse proxy: Caddy or Nginx
- TLS: terminate at the reverse proxy
- DNS: one hostname for the web app, one hostname for the API if you split them

## Environment

1. Copy `deploy/vps/.env.example` to `deploy/vps/.env`
2. Set `NEXT_PUBLIC_API_BASE_URL` to your public API URL
3. Set `DATABASE_URL` to the production PostgreSQL connection string
4. Set `CACHE_ROOT` to persistent local storage on the VM
5. If the NAS agent runs remotely, set its API base URL separately under `deploy/agent`

`deploy/vps/.env.example` now includes `WEB_IMAGE`, `API_IMAGE`, and `IMAGE_TAG`. Leave `IMAGE_TAG=main` to track the latest `main` build, or pin it to a published `sha-*` tag when you want a fixed rollout or rollback target.

## First launch

```bash
cd deploy/vps
docker compose pull
docker compose up -d
```

If your GHCR packages are private, log in to `ghcr.io` once on the VM before the first pull.

Then verify:

- your reverse-proxied web domain opens the web UI
- `curl -fsS http://127.0.0.1:18080/api/v1/healthz` succeeds on the VPS
- a user can register, create an album, generate an invite link, and upload media
- `docker compose logs api` shows one JSON log line per request with `request_id`

## Backups before every upgrade

Create a backup directory on the host:

```bash
mkdir -p ~/baby-album-backups/$(date +%F-%H%M%S)
BACKUP_DIR="$(ls -td ~/baby-album-backups/* | head -n 1)"
```

Back up PostgreSQL:

```bash
docker compose exec -T postgres pg_dump -U baby_album baby_album > "$BACKUP_DIR/postgres.sql"
```

Back up the API blob cache volume:

```bash
docker run --rm \
  -v baby-album-vps_media-cache:/from:ro \
  -v "$BACKUP_DIR":/to \
  alpine sh -lc 'cd /from && tar -czf /to/media-cache.tar.gz .'
```

Back up configuration:

```bash
cp .env "$BACKUP_DIR/.env"
```

If the NAS agent runs on another machine, also copy its `AGENT_LIBRARY_ROOT`, including `.agent-state.json`, on that machine.

## Release procedure

Publish a new image set from GitHub Actions, then on the VM update `IMAGE_TAG` in `deploy/vps/.env` and pull the selected version:

```bash
cd deploy/vps
docker compose pull
docker compose up -d
```

Verify process health:

```bash
curl -fsS http://127.0.0.1:3000 >/dev/null
curl -fsS http://127.0.0.1:18080/healthz
curl -fsS http://127.0.0.1:18080/api/v1/healthz
docker compose ps
```

Run the main smoke test manually:

1. Register or log in.
2. Create or enter an album.
3. Open the photo page and settings page, then go back.
4. Upload one photo and wait for it to appear in the timeline.
5. Generate an invite code.
6. Log out and log back in.

If you have a local test stack, run the automated smoke suite before the public rollout:

```bash
./scripts/test-e2e.sh
```

## Rollback

If the new release fails, change `IMAGE_TAG` back to the previous `sha-*` tag and restart:

```bash
cd deploy/vps
docker compose pull
docker compose up -d
```

If you also need to restore data:

1. Stop the stack with `docker compose down`.
2. Restore `postgres.sql` into PostgreSQL.
3. Restore `media-cache.tar.gz`.
4. Restore the NAS library backup and `.agent-state.json` if they were changed.
5. Start the stack again and repeat the health checks.

## Known limits of the current release

- The API still applies database migrations on startup.
- Auth is still bearer-token based, and some media access still uses query tokens.
- The PWA now caches static shell assets and supports update prompts, but it is not an offline-first product.

## Security limits of the current test build

- Password hashing is suitable for testing, not final internet production
- Auth is bearer-token based and preview images accept a token query parameter for now
- Blob cache is on local VM disk, not object storage

## Next production-hardening steps

- upgrade password hashing to Argon2id or bcrypt
- move auth to secure HTTP-only cookies or short-lived access tokens plus refresh tokens
- add signed preview URLs or cookie-gated media endpoints
- add HTTPS reverse proxy config
- add backups for PostgreSQL and the VM blob cache
