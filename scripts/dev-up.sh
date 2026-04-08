#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/tmp/run"
CACHE_DIR="$ROOT_DIR/tmp/cache"
R2_LOCAL_DIR="$ROOT_DIR/tmp/r2"
LIBRARY_DIR="$ROOT_DIR/tmp/library"
GO_BIN="${GO_BIN:-go}"
API_PID_FILE="$RUN_DIR/api.pid"
WEB_PID_FILE="$RUN_DIR/web.pid"
AGENT_PID_FILE="$RUN_DIR/agent.pid"
DATABASE_URL="postgres://baby_album:baby_album@localhost:5432/baby_album?sslmode=disable"
PUBLIC_HOST="${1:-${DEV_HOST:-192.168.31.200}}"
API_PORT="${DEV_API_PORT:-8080}"
WEB_PORT="${DEV_WEB_PORT:-3000}"
MEDIA_URL_SIGNING_SECRET="${MEDIA_URL_SIGNING_SECRET:-$(LC_ALL=C od -An -N32 -tx1 /dev/urandom | tr -d ' \n')}"

mkdir -p "$RUN_DIR" "$CACHE_DIR" "$R2_LOCAL_DIR" "$LIBRARY_DIR"

is_running() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    rm -f "$pid_file"
  fi
  return 1
}

start_process() {
  local name="$1"
  local workdir="$2"
  local pid_file="$3"
  local log_file="$4"
  shift 4

  if is_running "$pid_file"; then
    echo "$name is already running (pid $(cat "$pid_file"))"
    return 0
  fi

  (
    cd "$workdir"
    nohup "$@" >"$log_file" 2>&1 &
    echo $! >"$pid_file"
  )
  echo "started $name (pid $(cat "$pid_file"))"
}

echo "==> starting postgres"
docker compose up -d postgres >/dev/null

echo "==> waiting for postgres"
until docker compose exec -T postgres pg_isready -U baby_album -d baby_album >/dev/null 2>&1; do
  sleep 1
done

echo "==> starting api"
start_process \
  "api" \
  "$ROOT_DIR/services/api" \
  "$API_PID_FILE" \
  "$RUN_DIR/api.log" \
  env \
  DATABASE_URL="$DATABASE_URL" \
  CACHE_ROOT="$CACHE_DIR" \
  R2_LOCAL_ROOT="$R2_LOCAL_DIR" \
  API_ADDR=":$API_PORT" \
  MEDIA_URL_SIGNING_SECRET="$MEDIA_URL_SIGNING_SECRET" \
  ALLOWED_ORIGINS="http://$PUBLIC_HOST:$WEB_PORT,http://localhost:$WEB_PORT,http://127.0.0.1:$WEB_PORT" \
  "$GO_BIN" run ./cmd/server

echo "==> starting web"
start_process \
  "web" \
  "$ROOT_DIR/apps/web" \
  "$WEB_PID_FILE" \
  "$RUN_DIR/web.log" \
  env \
  NEXT_PUBLIC_API_BASE_URL="http://$PUBLIC_HOST:$API_PORT" \
  npm run dev -- --hostname 0.0.0.0 --port "$WEB_PORT"

if [[ -n "${AGENT_PAIRING_CODE:-}" || -n "${AGENT_NODE_ID:-}" || -n "${AGENT_NODE_TOKEN:-}" || -n "${AGENT_REGISTRATION_TOKEN:-}" ]]; then
  echo "==> starting agent"
  start_process \
    "agent" \
    "$ROOT_DIR/services/agent" \
    "$AGENT_PID_FILE" \
    "$RUN_DIR/agent.log" \
    env \
    AGENT_API_BASE_URL="http://$PUBLIC_HOST:$API_PORT" \
    AGENT_LIBRARY_ROOT="$LIBRARY_DIR" \
    AGENT_NODE_NAME="${AGENT_NODE_NAME:-Local NAS}" \
    AGENT_PAIRING_CODE="${AGENT_PAIRING_CODE:-}" \
    AGENT_NODE_ID="${AGENT_NODE_ID:-}" \
    AGENT_NODE_TOKEN="${AGENT_NODE_TOKEN:-}" \
    AGENT_REGISTRATION_TOKEN="${AGENT_REGISTRATION_TOKEN:-}" \
    "$GO_BIN" run ./cmd/agent
else
  echo "==> skipping agent (set AGENT_PAIRING_CODE or AGENT_NODE_ID/AGENT_NODE_TOKEN to auto-start it)"
fi

cat <<EOF

Dev stack is up.

Web:  http://$PUBLIC_HOST:$WEB_PORT
API:  http://$PUBLIC_HOST:$API_PORT

Logs:
  tail -f $RUN_DIR/api.log
  tail -f $RUN_DIR/web.log
  tail -f $RUN_DIR/agent.log

Stop:
  ./scripts/dev-down.sh
EOF
