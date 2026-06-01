#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime"
LOG_FILE="$RUNTIME_DIR/preview.log"
SESSION_NAME="desktop-web-demo-preview"

mkdir -p "$RUNTIME_DIR"

if screen -ls "$SESSION_NAME" 2>/dev/null | grep -q "$SESSION_NAME"; then
  echo "Stable preview server already running in screen session $SESSION_NAME"
  echo "URL: http://127.0.0.1:4174"
  exit 0
fi

cd "$ROOT_DIR"
npm run build
rm -f "$LOG_FILE"
screen -dmS "$SESSION_NAME" bash -lc "cd \"$ROOT_DIR\" && exec ./node_modules/.bin/vite preview --host 127.0.0.1 --port 4174 --strictPort >\"$LOG_FILE\" 2>&1"
sleep 2

if screen -ls "$SESSION_NAME" 2>/dev/null | grep -q "$SESSION_NAME"; then
  echo "Stable preview server started in screen session $SESSION_NAME"
  echo "URL: http://127.0.0.1:4174"
else
  echo "Stable preview server failed to start"
  exit 1
fi
