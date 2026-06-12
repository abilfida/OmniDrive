#!/usr/bin/env bash
set -e

echo "Starting Omnidrive Setup..."

if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js 18+."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed."
    exit 1
fi

# Ensure dependencies are installed quietly so the CLI tools are available
echo "Installing dependencies..."
npm install --quiet --no-fund --no-audit

# Hand off to the Node.js interactive CLI
node scripts/onboard-deploy.mjs
