#!/usr/bin/env bash
set -euo pipefail

# Resolve absolute path of the script before any cd operations
SCRIPT_PATH=$(realpath "$0" 2>/dev/null || readlink -f "$0" 2>/dev/null || echo "$0")

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
    
    # Export Git dummy identity variables to prevent crashes in headless environments
    export GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-Omnidrive Deployer}"
    export GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-deploy@omnidrive.local}"
    export GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-Omnidrive Deployer}"
    export GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-deploy@omnidrive.local}"

    # Fetch updates from origin quietly, ignoring failures if offline
    if git fetch origin --quiet 2>/dev/null; then
        CURRENT_BRANCH=$(git symbolic-ref --short -q HEAD 2>/dev/null || git branch --show-current 2>/dev/null || echo "main")
        CURRENT_BRANCH=${CURRENT_BRANCH:-main}
        
        # Check count of commits behind remote
        BEHIND_COUNT=$(git rev-list --count HEAD..origin/"$CURRENT_BRANCH" 2>/dev/null || echo 0)
        
        if [ "$BEHIND_COUNT" -gt 0 ]; then
            echo "--------------------------------------------------------"
            echo "A new version of Omnidrive is available! ($BEHIND_COUNT new commits)"
            echo "Recent changes:"
            git log HEAD..origin/"$CURRENT_BRANCH" --oneline -n 5 2>/dev/null || true
            echo "--------------------------------------------------------"
            
            WANT_UPDATE="n"
            if [ -t 1 ]; then
                read -p "Do you want to update to the latest version? (y/N): " WANT_UPDATE < /dev/tty || WANT_UPDATE="n"
            else
                read -p "Do you want to update to the latest version? (y/N): " WANT_UPDATE || WANT_UPDATE="n"
            fi
            
            if [[ "$WANT_UPDATE" =~ ^[Yy]$ ]]; then
                STASHED=false
                # Check for uncommitted changes in tracked files (both staged and unstaged)
                if ! git diff HEAD --quiet 2>/dev/null; then
                    echo "Warning: You have uncommitted changes in your repository."
                    echo "Select how you want to handle your local changes:"
                    echo "1) Save changes temporarily (git stash)"
                    echo "2) Discard local changes (git reset --hard)"
                    echo "3) Cancel update"
                    
                    CHANGE_CHOICE="3"
                    if [ -t 1 ]; then
                        read -p "Enter choice [1-3]: " CHANGE_CHOICE < /dev/tty || CHANGE_CHOICE="3"
                    else
                        read -p "Enter choice [1-3]: " CHANGE_CHOICE || CHANGE_CHOICE="3"
                    fi
                    
                    case "$CHANGE_CHOICE" in
                        1)
                            echo "Stashing local changes..."
                            git stash || { echo "Error: Failed to stash changes." >&2; exit 1; }
                            STASHED=true
                            ;;
                        2)
                            echo "Discarding local changes..."
                            git reset --hard HEAD || { echo "Error: Failed to reset changes." >&2; exit 1; }
                            STASHED=false
                            ;;
                        *)
                            echo "Update cancelled. Continuing with current version..."
                            WANT_UPDATE="n"
                            STASHED=false
                            ;;
                    esac
                fi
                
                if [[ "$WANT_UPDATE" =~ ^[Yy]$ ]]; then
                    echo "Updating repository (git pull)..."
                    
                    PULL_FAILED=false
                    git pull origin "$CURRENT_BRANCH" || PULL_FAILED=true
                    
                    # Check for merge conflicts
                    if git ls-files -u | grep -q .; then
                        echo "Error: Update resulted in merge conflicts. Please resolve conflicts manually." >&2
                        exit 1
                    fi
                    
                    if [ "$PULL_FAILED" = true ]; then
                        echo "Error: Failed to pull latest changes. Continuing with current version..."
                    else
                        echo "Update successful!"
                    fi
                    
                    # Pop stash if we stashed, regardless of pull success
                    if [ "$STASHED" = true ]; then
                        echo "Restoring stashed local changes..."
                        git stash pop || echo "Notice: Stash popped with conflicts. Please resolve manually."
                    fi
                    
                    # Restart script with updated code to avoid bash shell parser offset shift issues
                    if [ "$PULL_FAILED" = false ]; then
                        echo "Restarting script with updated code..."
                        exec bash "$SCRIPT_PATH" "$@"
                    fi
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
