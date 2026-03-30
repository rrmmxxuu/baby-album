#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/tmp/run"
PUBLIC_HOST="${1:-127.0.0.1}"
WEB_PORT="${DEV_WEB_PORT:-3100}"
API_PORT="${DEV_API_PORT:-18080}"
GO_BIN="${GO_BIN:-go}"
API_PID_FILE="$RUN_DIR/e2e-api.pid"
WEB_PID_FILE="$RUN_DIR/e2e-web.pid"
AGENT_PID_FILE="$RUN_DIR/e2e-agent.pid"

cleanup() {
  stop_process "$AGENT_PID_FILE"
  stop_process "$WEB_PID_FILE"
  stop_process "$API_PID_FILE"
  docker compose stop postgres >/dev/null 2>&1 || true
}

wait_for_http() {
  local url="$1"
  local name="$2"
  local attempts=0
  until curl -fsS "$url" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [[ "$attempts" -gt 60 ]]; then
      echo "timed out waiting for $name at $url" >&2
      exit 1
    fi
    sleep 1
  done
}

stop_process() {
  local pid_file="$1"
  if [[ ! -f "$pid_file" ]]; then
    return 0
  fi
  local pid
  pid="$(cat "$pid_file")"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" >/dev/null 2>&1 || true
  fi
  rm -f "$pid_file"
}

start_process() {
  local workdir="$1"
  local pid_file="$2"
  local log_file="$3"
  shift 3
  (
    cd "$workdir"
    nohup "$@" >"$log_file" 2>&1 &
    echo $! >"$pid_file"
  )
}

trap cleanup EXIT

mkdir -p "$RUN_DIR"

export AGENT_NODE_ID="${AGENT_NODE_ID:-node-demo}"
export AGENT_NODE_TOKEN="${AGENT_NODE_TOKEN:-demo-registration-token}"
export AGENT_NODE_NAME="${AGENT_NODE_NAME:-Local NAS}"
export DEV_WEB_PORT="$WEB_PORT"
export DEV_API_PORT="$API_PORT"

echo "==> starting postgres"
docker compose up -d postgres >/dev/null

echo "==> waiting for postgres"
until docker compose exec -T postgres pg_isready -U baby_album -d baby_album >/dev/null 2>&1; do
  sleep 1
done

echo "==> starting api"
start_process \
  "$ROOT_DIR/services/api" \
  "$API_PID_FILE" \
  "$RUN_DIR/e2e-api.log" \
  env \
  DATABASE_URL="postgres://baby_album:baby_album@localhost:5432/baby_album?sslmode=disable" \
  CACHE_ROOT="$ROOT_DIR/tmp/cache" \
  API_ADDR=":$API_PORT" \
  ALLOWED_ORIGINS="http://$PUBLIC_HOST:$WEB_PORT,http://localhost:$WEB_PORT,http://127.0.0.1:$WEB_PORT" \
  "$GO_BIN" run ./cmd/server

echo "==> building web"
(
  cd "$ROOT_DIR/apps/web"
  NEXT_PUBLIC_API_BASE_URL="http://$PUBLIC_HOST:$API_PORT" npm run build >"$RUN_DIR/e2e-web-build.log" 2>&1
)

echo "==> starting web"
start_process \
  "$ROOT_DIR/apps/web" \
  "$WEB_PID_FILE" \
  "$RUN_DIR/e2e-web.log" \
  env \
  NEXT_PUBLIC_API_BASE_URL="http://$PUBLIC_HOST:$API_PORT" \
  npm run start -- --hostname 0.0.0.0 --port "$WEB_PORT"

echo "==> starting agent"
start_process \
  "$ROOT_DIR/services/agent" \
  "$AGENT_PID_FILE" \
  "$RUN_DIR/e2e-agent.log" \
  env \
  AGENT_API_BASE_URL="http://$PUBLIC_HOST:$API_PORT" \
  AGENT_LIBRARY_ROOT="$ROOT_DIR/tmp/library" \
  AGENT_NODE_NAME="$AGENT_NODE_NAME" \
  AGENT_NODE_ID="$AGENT_NODE_ID" \
  AGENT_NODE_TOKEN="$AGENT_NODE_TOKEN" \
  "$GO_BIN" run ./cmd/agent

cat <<EOF

E2E stack is up.

Web:  http://$PUBLIC_HOST:$WEB_PORT
API:  http://$PUBLIC_HOST:$API_PORT

Logs:
  tail -f $RUN_DIR/e2e-api.log
  tail -f $RUN_DIR/e2e-web.log
  tail -f $RUN_DIR/e2e-agent.log

Stop:
  Ctrl+C
EOF

wait_for_http "http://$PUBLIC_HOST:$API_PORT/api/v1/healthz" "api"
wait_for_http "http://$PUBLIC_HOST:$WEB_PORT" "web"

PLAYWRIGHT_BASE_URL="http://$PUBLIC_HOST:$WEB_PORT" npm --prefix "$ROOT_DIR/apps/web" run test:e2e
