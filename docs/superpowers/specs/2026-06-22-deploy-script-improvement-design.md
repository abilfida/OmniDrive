# Design Specification: Improving deploy.sh Script with Flexible Auto-Updates

This document specifies the design for adding automatic update-checking and update capability to the `deploy.sh` script in the Omnidrive project, ensuring local configurations are preserved.

## 1. Goal
Improve `deploy.sh` so that when run, it detects if there is a newer version of the Omnidrive codebase available on the remote repository. If an update is available, the script asks the user if they want to pull the latest changes, manages local modified files safely, and proceeds with the setup without overwriting local configurations (`.env`, `wrangler.toml`, `.dev.vars`).

## 2. Approach: Git-Native Update Checking (Approach 2)
Instead of polling raw HTTP endpoints, the script will fetch updates directly from the git remote.
1. Run `git fetch origin --quiet` to get updates from the remote.
2. Determine if the current HEAD is behind the remote tracking branch of the active branch.
3. Compare commits using `git rev-list --count HEAD..origin/$CURRENT_BRANCH`.
4. If behind by 1 or more commits, display a log summary of the new commits.
5. Prompt the user for updating:
   - If they accept, check for local uncommitted modifications in tracked files (`git diff --quiet`).
   - If changes exist, offer options to stash them (`git stash`), discard them (`git reset --hard HEAD`), or cancel the update.
   - Run `git pull origin $CURRENT_BRANCH` to perform the update.
   - If changes were stashed, restore them (`git stash pop`).

## 3. Preservation of Local Settings
Files containing local secrets and environment setups must not be replaced. The following configurations are safe:
- `.env` and `.env.local`
- `packages/worker/.dev.vars`
- `packages/worker/wrangler.toml` (if generated/copied locally)

Because these files are listed in `.gitignore`, Git operations (`git pull`, `git stash`, `git reset --hard`) will ignore them, guaranteeing their safety.

## 4. Integration Details

### Integration Point
The update check block will be inserted inside `/deploy.sh` right after verifying the repository directory and entering it:

```bash
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

# ---> UPDATE AND VERSION CHECKING LOGIC INSERTED HERE <---
```

### Script Implementation Logic
```bash
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
            
            read -p "Do you want to update to the latest version? (y/N): " WANT_UPDATE
            if [[ "$WANT_UPDATE" =~ ^[Yy]$ ]]; then
                STASHED=false
                # Check for uncommitted changes in tracked files
                if ! git diff --quiet 2>/dev/null; then
                    echo "Warning: You have uncommitted changes in your repository."
                    echo "Select how you want to handle your local changes:"
                    echo "1) Save changes temporarily (git stash)"
                    echo "2) Discard local changes (git reset --hard)"
                    echo "3) Cancel update"
                    read -p "Enter choice [1-3]: " CHANGE_CHOICE
                    
                    case "$CHANGE_CHOICE" in
                        1)
                            echo "Stashing local changes..."
                            git stash
                            STASHED=true
                            ;;
                        2)
                            echo "Discarding local changes..."
                            git reset --hard HEAD
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
                    if git pull origin "$CURRENT_BRANCH"; then
                        echo "Update successful!"
                        if [ "$STASHED" = true ]; then
                            echo "Restoring stashed local changes..."
                            git stash pop || echo "Notice: Stash popped with conflicts. Please resolve manually."
                        fi
                    else
                        echo "Error: Failed to pull latest changes. Continuing with current version..."
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
```

## 5. Verification Plan
1. **Up-to-date validation**: Run the script when there are no new commits on remote. The output should be "Omnidrive is up to date."
2. **Offline resilience**: Disable network / mock DNS failure. The script should output "Unable to check for updates (git fetch failed)." and proceed without crashing.
3. **Pending updates detection**: Reset local HEAD back by one commit (e.g. `git reset --hard HEAD~1`), run the script. It should show 1 commit behind, display the commit description, and ask to update.
4. **Local modification stashing check**: Make a local change to a tracked file, run the script with HEAD~1, choose stash. The script should pull and re-apply local changes. Verify the local changes remain intact.
5. **Local modification discard check**: Make a local change to a tracked file, run the script with HEAD~1, choose discard. The script should pull and local changes should be discarded.
6. **Local configuration safety verification**: Ensure `.env` files are not deleted, overwritten, or modified by the update process under any option.
