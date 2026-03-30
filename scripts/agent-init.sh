#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${TARGET_DIR:-$ROOT_DIR/deploy/agent}"
ENV_FILE="$TARGET_DIR/.env"
CONFIG_DIR="$TARGET_DIR/config"
CONFIG_FILE="$CONFIG_DIR/agent.json"
COMPOSE_FILE="$TARGET_DIR/docker-compose.yml"
TEMPLATE_ENV_FILE="$TARGET_DIR/.env.example"

API_BASE_URL="${AGENT_API_BASE_URL:-}"
PAIRING_CODE="${AGENT_PAIRING_CODE:-}"
NODE_NAME="${AGENT_NODE_NAME:-}"
LIBRARY_HOST_PATH="${AGENT_LIBRARY_HOST_PATH:-}"
HEARTBEAT_INTERVAL="${AGENT_HEARTBEAT_INTERVAL:-15s}"

usage() {
  cat <<EOF
Usage:
  ./scripts/agent-init.sh --api-base-url URL --pairing-code CODE --node-name NAME --library-path PATH

Options:
  --api-base-url URL     Control plane base URL, e.g. http://192.168.31.200:8080
  --pairing-code CODE    Pairing code generated in the web control panel
  --node-name NAME       Friendly NAS node name shown in the app
  --library-path PATH    Host path to store originals and agent state
  --heartbeat DURATION   Optional heartbeat interval, default 15s
  --target-dir PATH      Optional output directory, default deploy/agent
  --help                 Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-base-url)
      API_BASE_URL="${2:-}"
      shift 2
      ;;
    --pairing-code)
      PAIRING_CODE="${2:-}"
      shift 2
      ;;
    --node-name)
      NODE_NAME="${2:-}"
      shift 2
      ;;
    --library-path)
      LIBRARY_HOST_PATH="${2:-}"
      shift 2
      ;;
    --heartbeat)
      HEARTBEAT_INTERVAL="${2:-}"
      shift 2
      ;;
    --target-dir)
      TARGET_DIR="${2:-}"
      ENV_FILE="$TARGET_DIR/.env"
      COMPOSE_FILE="$TARGET_DIR/docker-compose.yml"
      TEMPLATE_ENV_FILE="$TARGET_DIR/.env.example"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

prompt_if_empty() {
  local var_name="$1"
  local prompt_text="$2"
  local current_value="${!var_name:-}"
  if [[ -n "$current_value" ]]; then
    return 0
  fi
  read -r -p "$prompt_text: " current_value
  printf -v "$var_name" '%s' "$current_value"
}

prompt_if_empty API_BASE_URL "Control plane URL"
prompt_if_empty PAIRING_CODE "Pairing code"
prompt_if_empty NODE_NAME "Node name"
prompt_if_empty LIBRARY_HOST_PATH "Host library path"

if [[ -z "$API_BASE_URL" || -z "$PAIRING_CODE" || -z "$NODE_NAME" || -z "$LIBRARY_HOST_PATH" ]]; then
  echo "missing required values" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR" "$LIBRARY_HOST_PATH"
mkdir -p "$CONFIG_DIR"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  cp "$ROOT_DIR/deploy/agent/docker-compose.yml" "$COMPOSE_FILE"
fi

if [[ ! -f "$TEMPLATE_ENV_FILE" ]]; then
  cp "$ROOT_DIR/deploy/agent/.env.example" "$TEMPLATE_ENV_FILE"
fi

cat >"$ENV_FILE" <<EOF
AGENT_HEARTBEAT_INTERVAL=$HEARTBEAT_INTERVAL
AGENT_LIBRARY_HOST_PATH=$LIBRARY_HOST_PATH
AGENT_CONFIG_HOST_PATH=$CONFIG_DIR
EOF

cat >"$CONFIG_FILE" <<EOF
{
  "apiBaseURL": "$API_BASE_URL",
  "nodeName": "$NODE_NAME",
  "pairingCode": "$PAIRING_CODE",
  "heartbeatInterval": "$HEARTBEAT_INTERVAL",
  "libraryRoot": "/data/library"
}
EOF

cat <<EOF

Agent deployment files are ready:

  $ENV_FILE
  $COMPOSE_FILE
  $CONFIG_FILE

Next:

  cd $TARGET_DIR
  docker compose pull && docker compose up -d

Library path:

  $LIBRARY_HOST_PATH

Notes:

  - The container includes ffmpeg for video poster generation.
  - After first successful pairing, node credentials are saved under the mounted library path.
  - The runtime config lives in $CONFIG_FILE.
  - If you need to re-pair, stop the container and delete .agent-state.json under the library path and pairingCode in $CONFIG_FILE.
EOF
