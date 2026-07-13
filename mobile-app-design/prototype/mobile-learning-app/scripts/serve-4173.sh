#!/bin/zsh

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
cd "$PROJECT_DIR" || exit 1

exec /usr/local/bin/node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173
