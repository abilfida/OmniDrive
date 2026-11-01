#!/bin/sh
set -e

# The server runs as the unprivileged "node" user. Releases before 0.11.2 ran
# as root, so an existing data volume may be owned by root: fix its ownership
# while we still can, then drop privileges.
DATA_DIR="${DATA_DIR:-/app/data}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  if [ -n "$(find "$DATA_DIR" ! -user node -print -quit)" ]; then
    echo "Fixing ownership of $DATA_DIR for the node user..."
    chown -R node:node "$DATA_DIR"
  fi
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
