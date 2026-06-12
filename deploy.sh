#!/usr/bin/env bash
set -euo pipefail

echo "Starting Omnidrive Setup..."

# Check if we are in the omnidrive directory
if [ ! -f "package.json" ] || ! grep -q '"name": "omnidrive"' package.json; then
    echo "Omnidrive repository not found in current directory."
    echo "Cloning https://github.com/abilfida/omnidrive.git..."
    git clone https://github.com/abilfida/omnidrive.git
    cd omnidrive
fi
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js 18+." >&2
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed." >&2
    exit 1
fi

# Ensure dependencies are installed quietly so the CLI tools are available
echo "Installing dependencies..."
npm install --quiet --no-fund --no-audit

# Hand off to the Node.js interactive CLI
if [ -t 1 ]; then
    # Connect stdin to the terminal so interactive prompts work over curl | bash
    node scripts/onboard-deploy.mjs "$@" < /dev/tty
else
    node scripts/onboard-deploy.mjs "$@"
fi
