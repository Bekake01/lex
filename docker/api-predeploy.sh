#!/bin/sh
# Railway pre-deploy step for the api: apply Drizzle migrations before the new
# version starts. A script (not an inline command) because Railway execs the
# pre-deploy command without a shell.
set -eu
cd /repo/apps/api

attempts=5
n=1
while :; do
  echo "predeploy: migrate (attempt ${n}/${attempts})"
  if node dist/db/migrate.js; then
    exit 0
  fi
  if [ "$n" -ge "$attempts" ]; then
    echo "predeploy: migrations failed, deploy aborted" >&2
    exit 1
  fi
  n=$((n + 1))
  sleep 5
done
