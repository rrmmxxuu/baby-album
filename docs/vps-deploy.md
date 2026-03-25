# VPS Deployment Guide

This guide matches your target setup:

- Ubuntu VPS
- Docker + Docker Compose
- Nginx Proxy Manager
- Cloudflare DNS
- one public web domain and one public API domain

## Recommended topology

Use two hostnames:

- `album.yourdomain.com` -> Baby Album web app
- `api.album.yourdomain.com` -> Baby Album API

Keep the NAS agent outside the VPS. It should call the public API domain outbound from your home network.

## 1. DNS in Cloudflare

Create two DNS records pointing to the VPS public IP:

- `album`
- `api.album`

For the first smoke test, DNS-only mode is the simplest path because it removes one extra proxy layer while you validate uploads and previews.

## 2. Server environment

Create `.env` from `.env.example`, then set at least:

```env
NEXT_PUBLIC_API_BASE_URL=https://api.album.yourdomain.com
API_ADDR=:8080
DATABASE_URL=postgres://baby_album:REPLACE_ME@postgres:5432/baby_album?sslmode=disable
CACHE_ROOT=/var/lib/baby-album/cache
MAX_UPLOAD_MB=512
ALLOWED_ORIGINS=https://album.yourdomain.com
AGENT_API_BASE_URL=https://api.album.yourdomain.com
AGENT_NODE_ID=node-demo
AGENT_NODE_NAME=Home NAS
AGENT_REGISTRATION_TOKEN=REPLACE_ME
AGENT_HEARTBEAT_INTERVAL=15s
AGENT_LIBRARY_ROOT=/var/lib/baby-album/library
```

If you want both a production domain and a temporary preview domain, separate them with commas in `ALLOWED_ORIGINS`.

## 3. Start the stack

```bash
docker compose up --build -d
```

## 4. Nginx Proxy Manager

Create two proxy hosts.

### Web host

- Domain: `album.yourdomain.com`
- Forward host: `127.0.0.1`
- Forward port: `3000`
- Websockets: enabled
- Block common exploits: enabled
- SSL: request a Let's Encrypt certificate and force SSL

### API host

- Domain: `api.album.yourdomain.com`
- Forward host: `127.0.0.1`
- Forward port: `8080`
- Websockets: enabled
- Block common exploits: enabled
- SSL: request a Let's Encrypt certificate and force SSL

## 5. Verify

Check these URLs after NPM is ready:

- `https://album.yourdomain.com`
- `https://api.album.yourdomain.com/healthz`
- `https://api.album.yourdomain.com/api/v1/healthz`

Then validate the product flow:

1. Register a user
2. Create a family
3. Create a baby profile
4. Generate an invite link
5. Upload one image
6. Confirm the timeline loads through the public web domain

## 6. NAS agent on the home side

When you move the agent off the VPS, set:

- `AGENT_API_BASE_URL=https://api.album.yourdomain.com`
- `AGENT_NODE_ID` and `AGENT_REGISTRATION_TOKEN` to your real pairing values
- `AGENT_LIBRARY_ROOT` to local NAS storage

The home agent only needs outbound HTTPS access to the API domain.