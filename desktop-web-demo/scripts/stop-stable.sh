#!/bin/sh
set -eu

SESSION_NAME="desktop-web-demo-preview"

if ! screen -ls "$SESSION_NAME" 2>/dev/null | grep -q "$SESSION_NAME"; then
  echo "Stable preview server is not running"
  exit 0
fi

screen -S "$SESSION_NAME" -X quit
echo "Stopped stable preview server in screen session $SESSION_NAME"
