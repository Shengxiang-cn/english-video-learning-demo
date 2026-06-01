#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT_DIR/.runtime/server.pid"

if ! [ -f "$PID_FILE" ] || ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  EXISTING_PID="$(lsof -ti tcp:4174 2>/dev/null | head -n 1 || true)"
  if [ -z "$EXISTING_PID" ]; then
    echo "Stable preview server is not running"
    exit 1
  fi

  mkdir -p "$(dirname "$PID_FILE")"
  echo "$EXISTING_PID" > "$PID_FILE"
fi

echo "Stable preview server is running with PID $(cat "$PID_FILE")"
echo "URL: http://127.0.0.1:4174"
