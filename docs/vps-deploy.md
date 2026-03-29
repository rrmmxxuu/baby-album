# VPS Deployment Guide

[中文版](vps-deploy.zh-CN.md)

This guide matches your target setup:

- Ubuntu VPS
- Docker + Docker Compose
- Nginx Proxy Manager
- Cloudflare DNS
- one public web domain and one public API domain

## Recommended topology

Use two hostnames:

- `album.ramonxu.com` -> Baby Album web app
- `album-api.ramonxu.com` -> Baby Album API

Keep the NAS agent outside the VPS. It should call the public API domain outbound from your home network.

## 1. DNS in Cloudflare

Create two DNS records pointing to the VPS public IP:

- `album`
- `album-api`

For the first smoke test, DNS-only mode is the simplest path because it removes one extra proxy layer while you validate uploads and previews.

## 2. Server environment

Create `.env` from `deploy/vps/.env.example`, then set at least:

```env
NEXT_PUBLIC_API_BASE_URL=https://album-api.ramonxu.com
WEB_PORT=3000
API_PORT=18080
POSTGRES_PORT=15432
POSTGRES_DB=baby_album
POSTGRES_USER=baby_album
POSTGRES_PASSWORD=REPLACE_ME
API_ADDR=:8080
DATABASE_URL=postgres://baby_album:REPLACE_ME@postgres:5432/baby_album?sslmode=disable
CACHE_ROOT=/var/lib/baby-album/cache
MAX_UPLOAD_MB=512
ALLOWED_ORIGINS=https://album.ramonxu.com
```

The VPS deployment bundle lives in `deploy/vps`, not the repository root.

If you want both a production domain and a temporary preview domain, separate them with commas in `ALLOWED_ORIGINS`.

## 3. Shared Docker network with NPM

Because your Nginx Proxy Manager is also in Docker, create or confirm the external network once:

```bash
docker network create npm_net
```

Then start Baby Album with the NPM override:

```bash
cd deploy/vps
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.npm.yml up --build -d
```

This puts the `web` and `api` services onto the same Docker network as NPM, so NPM can proxy to them by service name instead of by host port.

## 4. Nginx Proxy Manager

Create two proxy hosts.

### Web host

- Domain: `album.ramonxu.com`
- Scheme: `http`
- Forward host: `web`
- Forward port: `3000`
- Websockets: enabled
- Block common exploits: enabled
- SSL: request a Let's Encrypt certificate and force SSL

### API host

- Domain: `album-api.ramonxu.com`
- Scheme: `http`
- Forward host: `api`
- Forward port: `8080`
- Websockets: enabled
- Block common exploits: enabled
- SSL: request a Let's Encrypt certificate and force SSL

If you prefer to keep NPM proxying to host ports instead, you can skip `docker-compose.npm.yml` and continue forwarding to `127.0.0.1:3000` and `127.0.0.1:18080`.

## 5. Verify

Check these URLs after NPM is ready:

- `https://album.ramonxu.com`
- `https://album-api.ramonxu.com/healthz`
- `https://album-api.ramonxu.com/api/v1/healthz`

Then validate the product flow:

1. Register a user
2. Create an album
3. Confirm the baby profile is created with the album
4. Generate an invite link
5. Upload one image
6. Confirm the timeline loads through the public web domain

Also confirm the API emits structured JSON request logs:

```bash
docker compose logs --tail=20 api
```

Each request should include a `request_id`, path, status, and duration in milliseconds.

## 6. Backup before every release

Create a timestamped backup directory on the VPS:

```bash
mkdir -p ~/baby-album-backups/$(date +%F-%H%M%S)
BACKUP_DIR="$(ls -td ~/baby-album-backups/* | head -n 1)"
```

Back up PostgreSQL:

```bash
docker compose exec -T postgres pg_dump -U baby_album baby_album > "$BACKUP_DIR/postgres.sql"
```

Back up the API cache volume:

```bash
docker run --rm \
  -v baby-album-vps_media-cache:/from:ro \
  -v "$BACKUP_DIR":/to \
  alpine sh -lc 'cd /from && tar -czf /to/media-cache.tar.gz .'
```

Back up your environment file:

```bash
cp .env "$BACKUP_DIR/.env"
```

On the home NAS or Linux box, also back up:

- the full `AGENT_LIBRARY_ROOT`
- the `.agent-state.json` file inside that library root
- the agent config file if you use `deploy/agent/config/agent.json`

## 7. Release flow

On the VPS:

```bash
git pull
cd deploy/vps
docker compose -f docker-compose.yml -f docker-compose.npm.yml up --build -d
```

Validate health:

```bash
curl -fsS https://album-api.ramonxu.com/healthz
curl -fsS https://album-api.ramonxu.com/api/v1/healthz
docker compose ps
```

Validate the public app:

1. Open the web domain.
2. Log in.
3. Switch between photos and settings.
4. Upload one image.
5. Confirm the preview appears after the agent processes it.
6. Generate an invite code.
7. Log out and log back in.

If you maintain a staging or local stack, run the automated browser suite before the VPS upgrade:

```bash
./scripts/test-e2e.sh
```

## 8. Rollback

If the release fails:

1. Check `docker compose logs api web` for the failing service.
2. Return to the previous git revision.
3. Run `docker compose -f docker-compose.yml -f docker-compose.npm.yml up --build -d`.
4. Re-run the health checks and the public smoke test.

If you must restore data as well:

1. Stop the stack.
2. Restore `postgres.sql`.
3. Restore `media-cache.tar.gz`.
4. Restore the NAS library backup and `.agent-state.json`.
5. Start the stack again.

## 9. NAS agent on the home side

The NAS agent is a separate deployment under `deploy/agent`. When you move it off the VPS, set:

- `AGENT_API_BASE_URL=https://album-api.ramonxu.com`
- `AGENT_PAIRING_CODE` for first-time setup
- `AGENT_LIBRARY_ROOT` to local NAS storage

The home agent only needs outbound HTTPS access to the API domain.

## 10. Current production caveats

- API startup still performs database migrations automatically.
- Auth is still bearer-token based, and preview/original media access still uses token-bearing URLs in some flows.
- The PWA now caches static assets and supports update prompts, but does not offer full offline browsing.
