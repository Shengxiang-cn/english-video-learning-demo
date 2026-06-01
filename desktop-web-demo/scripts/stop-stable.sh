#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT_DIR/.runtime/server.pid"

if ! [ -f "$PID_FILE" ] || ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  EXISTING_PID="$(lsof -ti tcp:4174 2>/dev/null | head -n 1 || true)"
  if [ -n "$EXISTING_PID" ]; then
    kill "$EXISTING_PID"
    rm -f "$PID_FILE"
    echo "Stopped stable preview server"
    exit 0
  fi

  echo "Stable preview server is not running"
  rm -f "$PID_FILE"
  exit 0
fi

kill "$(cat "$PID_FILE")"
rm -f "$PID_FILE"
echo "Stopped stable preview server"
