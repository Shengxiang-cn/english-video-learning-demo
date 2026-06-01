#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime"
LOG_FILE="$RUNTIME_DIR/preview.log"
PID_FILE="$RUNTIME_DIR/server.pid"
SESSION_NAME="desktop-web-demo-preview"

mkdir -p "$RUNTIME_DIR"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Stable preview server already running with PID $(cat "$PID_FILE")"
  echo "URL: http://127.0.0.1:4174"
  exit 0
fi

EXISTING_PID="$(lsof -ti tcp:4174 2>/dev/null | head -n 1 || true)"
if [ -n "$EXISTING_PID" ]; then
  echo "$EXISTING_PID" > "$PID_FILE"
  echo "Stable preview server already running with PID $EXISTING_PID"
  echo "URL: http://127.0.0.1:4174"
  exit 0
fi

cd "$ROOT_DIR"
npm run build
rm -f "$LOG_FILE"
screen -dmS "$SESSION_NAME" bash -lc "cd \"$ROOT_DIR\" && exec env HOST=127.0.0.1 PORT=4174 node server.mjs >\"$LOG_FILE\" 2>&1"
sleep 2
STARTED_PID="$(lsof -ti tcp:4174 2>/dev/null | head -n 1 || true)"

if [ -n "$STARTED_PID" ]; then
  echo "$STARTED_PID" > "$PID_FILE"
  echo "Stable preview server started with PID $STARTED_PID"
  echo "URL: http://127.0.0.1:4174"
else
  echo "Stable preview server failed to start"
  rm -f "$PID_FILE"
  exit 1
fi
