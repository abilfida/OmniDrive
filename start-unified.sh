#!/bin/sh

echo "Starting Wrangler Backend..."
cd /app/packages/worker
# Initialize D1 SQLite directory if not exists
mkdir -p .wrangler/state/v3/d1
npm run dev -- --ip 127.0.0.1 --port 8787 &

echo "Waiting for Wrangler to initialize..."
sleep 2

echo "Starting Nginx Frontend..."
nginx -g 'daemon off;'
