# Test Deployment Guide

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

1. Copy `.env.example` to `.env`
2. Set `NEXT_PUBLIC_API_BASE_URL` to your public API URL
3. Set `DATABASE_URL` to the production PostgreSQL connection string
4. Set `CACHE_ROOT` to persistent local storage on the VM
5. If the NAS agent runs remotely, set `AGENT_API_BASE_URL` to the public API URL

## First launch

```bash
docker compose up --build -d
```

Then verify:

- `http://<host>:3000` opens the web UI
- `http://<host>:8080/api/v1/healthz` is reachable if you add a health endpoint later
- a user can register, create an album, generate an invite link, and upload media

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
