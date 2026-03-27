#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/tmp/run"
CACHE_DIR="$ROOT_DIR/tmp/cache"
LIBRARY_DIR="$ROOT_DIR/tmp/library"
API_PID_FILE="$RUN_DIR/api.pid"
WEB_PID_FILE="$RUN_DIR/web.pid"
AGENT_PID_FILE="$RUN_DIR/agent.pid"
DATABASE_URL="postgres://baby_album:baby_album@localhost:5432/baby_album?sslmode=disable"
PUBLIC_HOST="${1:-${DEV_HOST:-192.168.31.200}}"

mkdir -p "$RUN_DIR" "$CACHE_DIR" "$LIBRARY_DIR"

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
  local pid_file="$2"
  local log_file="$3"
  shift 3

  if is_running "$pid_file"; then
    echo "$name is already running (pid $(cat "$pid_file"))"
    return 0
  fi

  (
    cd "$ROOT_DIR"
    nohup "$@" >"$log_file" 2>&1 &
    echo $! >"$pid_file"
  )
  echo "started $name (pid $(cat "$pid_file"))"
}

echo "==> starting postgres"
docker compose up -d postgres >/dev/null

echo "==> waiting for postgres"
until psql "$DATABASE_URL" -c "select 1" >/dev/null 2>&1; do
  sleep 1
done

echo "==> starting api"
start_process \
  "api" \
  "$API_PID_FILE" \
  "$RUN_DIR/api.log" \
  env \
  DATABASE_URL="$DATABASE_URL" \
  CACHE_ROOT="$CACHE_DIR" \
  API_ADDR=":8080" \
  ALLOWED_ORIGINS="http://$PUBLIC_HOST:3000,http://localhost:3000,http://127.0.0.1:3000" \
  /usr/local/go/bin/go run ./services/api/cmd/server

echo "==> starting web"
start_process \
  "web" \
  "$WEB_PID_FILE" \
  "$RUN_DIR/web.log" \
  env \
  NEXT_PUBLIC_API_BASE_URL="http://$PUBLIC_HOST:8080" \
  npm --prefix "$ROOT_DIR/apps/web" run dev -- --hostname 0.0.0.0 --port 3000

if [[ -n "${AGENT_PAIRING_CODE:-}" || -n "${AGENT_NODE_ID:-}" || -n "${AGENT_NODE_TOKEN:-}" || -n "${AGENT_REGISTRATION_TOKEN:-}" ]]; then
  echo "==> starting agent"
  start_process \
    "agent" \
    "$AGENT_PID_FILE" \
    "$RUN_DIR/agent.log" \
    env \
    AGENT_API_BASE_URL="http://$PUBLIC_HOST:8080" \
    AGENT_LIBRARY_ROOT="$LIBRARY_DIR" \
    AGENT_NODE_NAME="${AGENT_NODE_NAME:-Local NAS}" \
    AGENT_PAIRING_CODE="${AGENT_PAIRING_CODE:-}" \
    AGENT_NODE_ID="${AGENT_NODE_ID:-}" \
    AGENT_NODE_TOKEN="${AGENT_NODE_TOKEN:-}" \
    AGENT_REGISTRATION_TOKEN="${AGENT_REGISTRATION_TOKEN:-}" \
    /usr/local/go/bin/go run ./services/agent/cmd/agent
else
  echo "==> skipping agent (set AGENT_PAIRING_CODE or AGENT_NODE_ID/AGENT_NODE_TOKEN to auto-start it)"
fi

cat <<EOF

Dev stack is up.

Web:  http://$PUBLIC_HOST:3000
API:  http://$PUBLIC_HOST:8080

Logs:
  tail -f $RUN_DIR/api.log
  tail -f $RUN_DIR/web.log
  tail -f $RUN_DIR/agent.log

Stop:
  ./scripts/dev-down.sh
EOF
