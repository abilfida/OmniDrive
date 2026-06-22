#!/usr/bin/env bash
set -euo pipefail

echo "Starting Omnidrive Setup..."

# Check if we are in the omnidrive directory
if [ ! -f "package.json" ] || ! grep -q '"name": "omnidrive"' package.json; then
    if [ -d "omnidrive" ]; then
        echo "Found existing 'omnidrive' directory. Entering..."
        cd omnidrive
    else
        echo "Omnidrive repository not found in current directory."
        echo "Cloning https://github.com/abilfida/omnidrive.git..."
        git clone https://github.com/abilfida/omnidrive.git
        cd omnidrive
    fi
fi

# Check for updates if we are in a git repository
if [ -d ".git" ]; then
    echo "Checking for updates..."
    # Fetch updates from origin quietly, ignoring failures if offline
    if git fetch origin --quiet 2>/dev/null; then
        CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
        
        # Check count of commits behind remote
        BEHIND_COUNT=$(git rev-list --count HEAD..origin/"$CURRENT_BRANCH" 2>/dev/null || echo 0)
        
        if [ "$BEHIND_COUNT" -gt 0 ]; then
            echo "--------------------------------------------------------"
            echo "A new version of Omnidrive is available! ($BEHIND_COUNT new commits)"
            echo "Recent changes:"
            git log HEAD..origin/"$CURRENT_BRANCH" --oneline -n 5 2>/dev/null || true
            echo "--------------------------------------------------------"
            
            WANT_UPDATE="n"
            read -p "Do you want to update to the latest version? (y/N): " WANT_UPDATE || WANT_UPDATE="n"
            if [[ "$WANT_UPDATE" =~ ^[Yy]$ ]]; then
                echo "Updating repository (git pull)..."
                if git pull origin "$CURRENT_BRANCH"; then
                    echo "Update successful!"
                else
                    echo "Error: Failed to pull latest changes. Continuing with current version..."
                fi
            else
                echo "Continuing with current version..."
            fi
        else
            echo "Omnidrive is up to date."
        fi
    else
        echo "Unable to check for updates (git fetch failed)."
    fi
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
