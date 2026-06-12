#!/bin/sh
set -e

echo "Starting Wrangler Backend..."
cd /app/packages/worker

# Map OS env vars to .dev.vars for Wrangler
echo "FRONTEND_URL=$FRONTEND_URL" > .dev.vars
echo "WORKER_URL=$WORKER_URL" >> .dev.vars
echo "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID" >> .dev.vars
echo "GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET" >> .dev.vars
echo "JWT_SECRET=$JWT_SECRET" >> .dev.vars
echo "TOKEN_ENCRYPTION_KEY=$TOKEN_ENCRYPTION_KEY" >> .dev.vars

# Initialize D1 SQLite directory if not exists
mkdir -p .wrangler/state/v3/d1
npm run dev -- --ip 127.0.0.1 --port 8787 &

echo "Waiting for Wrangler to initialize..."
sleep 2

echo "Starting Nginx Frontend..."
exec nginx -g 'daemon off;'
