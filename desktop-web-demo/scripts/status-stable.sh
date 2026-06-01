#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
SESSION_NAME="desktop-web-demo-preview"

if ! screen -ls "$SESSION_NAME" 2>/dev/null | grep -q "$SESSION_NAME"; then
  echo "Stable preview server is not running"
  exit 1
fi

echo "Stable preview server is running in screen session $SESSION_NAME"
echo "URL: http://127.0.0.1:4174"
