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
INTERNAL_API_BASE_URL=http://baby-album-api:8080
WEB_IMAGE=ghcr.io/rrmmxxuu/baby-album-web
API_IMAGE=ghcr.io/rrmmxxuu/baby-album-api
IMAGE_TAG=main
WEB_PORT=3000
API_PORT=18080
POSTGRES_PORT=15432
POSTGRES_DB=baby_album
POSTGRES_USER=baby_album
POSTGRES_PASSWORD=REPLACE_ME
API_ADDR=:8080
DATABASE_URL=postgres://baby_album:REPLACE_ME@postgres:5432/baby_album?sslmode=disable
CACHE_ROOT=/var/lib/baby-album/cache
PUBLIC_API_BASE_URL=https://album-api.ramonxu.com
MEDIA_URL_SIGNING_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
MAX_UPLOAD_MB=512
BLOB_STORAGE_MAX_GB=50
BLOB_STORAGE_TARGET_GB=35
ORIGINAL_HOT_MIN_RETENTION_DAYS=30
R2_MAX_GB=8
R2_TARGET_GB=6
ALLOWED_ORIGINS=https://album.ramonxu.com
```

The VPS deployment bundle lives in `deploy/vps`, not the repository root.

If you want both a production domain and a temporary preview domain, separate them with commas in `ALLOWED_ORIGINS`.

Leave `IMAGE_TAG=main` if the VPS should always track the latest published image from `main`. For a fixed rollout or rollback target, pin it to a published `sha-*` tag instead.

## 3. GitHub Actions configuration

Set these GitHub repository variables:

- `PROD_SSH_HOST`: VPS hostname or IP
- `PROD_SSH_PORT`: optional SSH port, default `22`
- `PROD_SSH_USER`: SSH user for the deployment workflow
- `PROD_DEPLOY_PATH`: remote directory that holds your VPS `.env` file
- `PROD_COMPOSE_FILES`: `-f docker-compose.yml` by default, or `-f docker-compose.yml -f docker-compose.npm.yml` if you use the NPM override
- `PROD_DOCKER_USE_SUDO`: set to `true` when the remote user must run Docker through `sudo`
- `GHCR_READ_USER`: GitHub username that owns the package-read token

Set these GitHub repository secrets:

- `PROD_SSH_KEY`: private SSH key used by `Deploy Production`
- `GHCR_READ_TOKEN`: GitHub token with `read:packages` access for the VPS

The `Deploy Production` workflow syncs `deploy/vps/docker-compose.yml` and `deploy/vps/docker-compose.npm.yml` into `PROD_DEPLOY_PATH` on every release. Keep the VPS `.env` file in that same directory.

## 4. Shared Docker network with NPM

Because your Nginx Proxy Manager is also in Docker, create or confirm the external network once:

```bash
docker network create npm_net
```

Then start Baby Album with the NPM override:

```bash
cd deploy/vps
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.npm.yml pull
docker compose -f docker-compose.yml -f docker-compose.npm.yml up -d
```

This puts the `baby-album-web` and `baby-album-api` services onto the same Docker network as NPM, so NPM can proxy to them by service name instead of by host port.

If your GHCR packages are private, run `docker login ghcr.io` on the VPS once before the first pull.

## 5. Nginx Proxy Manager

Create two proxy hosts.

### Web host

- Domain: `album.ramonxu.com`
- Scheme: `http`
- Forward host: `baby-album-web`
- Forward port: `3000`
- Websockets: enabled
- Block common exploits: enabled
- SSL: request a Let's Encrypt certificate and force SSL

### API host

- Domain: `album-api.ramonxu.com`
- Scheme: `http`
- Forward host: `baby-album-api`
- Forward port: `8080`
- Websockets: enabled
- Block common exploits: enabled
- SSL: request a Let's Encrypt certificate and force SSL

If you prefer to keep NPM proxying to host ports instead, you can skip `docker-compose.npm.yml` and continue forwarding to `127.0.0.1:3000` and `127.0.0.1:18080`.

## 6. Verify

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
docker compose logs --tail=20 baby-album-api
```

Each request should include a `request_id`, path, status, and duration in milliseconds.

## 7. Backup before every release

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

## 8. Release flow

Recommended production release path:

1. Merge the verified commit into `main`.
2. Wait for the `Publish Images` job in `CI` to push the new `main` and `sha-*` tags to GHCR.
3. Run the `Deploy Production` workflow and pass the immutable `sha-*` tag you want to release.
4. Confirm the workflow finishes cleanly, then run the health checks below.

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

If you need a fully manual fallback on the VPS, update `IMAGE_TAG` in `.env` and run the same Compose file set you configured in `PROD_COMPOSE_FILES`:

```bash
docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d
```

Add `-f docker-compose.npm.yml` to both commands when you use the NPM override.

## 9. Rollback

If the release fails:

1. Check `docker compose logs baby-album-api baby-album-web` for the failing service.
2. Re-run `Deploy Production` with the previous `sha-*` image tag, or set `IMAGE_TAG` back to that tag manually on the VPS.
3. Run the same Compose file set you configured in `PROD_COMPOSE_FILES`, for example `docker compose -f docker-compose.yml pull`.
4. Start the previous image tag again with the matching `docker compose ... up -d` command.
5. Re-run the health checks and the public smoke test.

If you must restore data as well:

1. Stop the stack.
2. Restore `postgres.sql`.
3. Restore `media-cache.tar.gz`.
4. Restore the NAS library backup and `.agent-state.json`.
5. Start the stack again.

## 10. NAS agent on the home side

The NAS agent is a separate deployment under `deploy/agent`. When you move it off the VPS, set:

- `AGENT_API_BASE_URL=https://album-api.ramonxu.com`
- `AGENT_PAIRING_CODE` for first-time setup
- `AGENT_LIBRARY_ROOT` to local NAS storage

The home agent only needs outbound HTTPS access to the API domain.

After `main` pushes, GitHub Actions also publishes `ghcr.io/rrmmxxuu/baby-album-agent`. Upgrade the NAS side manually with:

```bash
cd deploy/agent
docker compose pull
docker compose up -d
```

## 11. Current production caveats

- API startup still performs database migrations automatically.
- Auth is still bearer-token based, and preview/original media access still uses token-bearing URLs in some flows.
- The PWA now caches static assets and supports update prompts, but does not offer full offline browsing.
