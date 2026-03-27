#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/tmp/run"

stop_process() {
  local name="$1"
  local pid_file="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "$name is not running"
    return 0
  fi

  local pid
  pid="$(cat "$pid_file")"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "stopped $name (pid $pid)"
  else
    echo "$name pid file was stale"
  fi
  rm -f "$pid_file"
}

stop_process "agent" "$RUN_DIR/agent.pid"
stop_process "web" "$RUN_DIR/web.pid"
stop_process "api" "$RUN_DIR/api.pid"

docker compose stop postgres >/dev/null 2>&1 || true
echo "stopped postgres"
