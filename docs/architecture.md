# Architecture

## Components

- `web`: mobile-first PWA shell for browsing the family timeline, checking storage-node health, and creating upload sessions
- `api`: cloud control plane for family membership, RBAC, timeline queries, upload sessions, and agent coordination
- `agent`: outbound NAS connector that registers itself, heartbeats, polls jobs, and simulates file-processing completion

## Why this shape

Most target families do not have a stable public IPv4 address or a safe way to expose a NAS directly. The control plane is designed as the public entrypoint, while the storage node keeps an outbound connection and does the media work at home.

## Current contracts

- web reads `bootstrap`, `timeline`, and `members`
- upload creation enqueues a media ingest job bound to a storage node
- the agent polls pending jobs and marks them complete

## Next steps

- replace the in-memory repository with PostgreSQL
- add media metadata extraction and preview generation
- introduce short-lived encrypted cloud buffering for NAS-offline uploads
- add auth sessions, invitation flows, and signed media relay endpoints
