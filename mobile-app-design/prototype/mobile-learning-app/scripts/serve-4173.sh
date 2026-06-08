#!/bin/zsh

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd "/Users/shishengxiang/Documents/New project 2/mobile-app-design/prototype/mobile-learning-app" || exit 1

exec /usr/local/bin/node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173
