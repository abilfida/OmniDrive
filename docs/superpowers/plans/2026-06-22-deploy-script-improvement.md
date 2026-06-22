# Deploy Script Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve `deploy.sh` to support flexible Git-native update checking and prompt the user to update while safely handling uncommitted local changes and preserving local configurations.

**Architecture:** Integrate Git-native fetch and commit-behind comparison inside `deploy.sh` right after verifying the repository directory. Use `git diff` to check for uncommitted tracked changes and offer options to stash, discard, or cancel updates before executing a `git pull`.

**Tech Stack:** Bash, Git.

---

### Task 1: Add Git-Native Version Checking & Basic Update Prompt

**Files:**
- Modify: `deploy.sh` (around line 17)

- [ ] **Step 1: Write the update-checking and basic prompt logic**

Modify `deploy.sh` around line 17 to add the `git fetch` and `git rev-list` comparison:

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
```

- [ ] **Step 2: Verify the "up-to-date" output**

Run:
```bash
./deploy.sh
```
Expected output:
Contains "Checking for updates..." and then "Omnidrive is up to date." (assuming there are no pending remote commits).

- [ ] **Step 3: Verify the update detection and rejection**

1. Backup current HEAD commit ID:
```bash
CURRENT_HEAD=$(git rev-parse HEAD)
```
2. Reset local branch back by 1 commit:
```bash
git reset --hard HEAD~1
```
3. Run the deployment script and reject the update:
```bash
./deploy.sh
```
Expected prompt:
```
A new version of Omnidrive is available! (1 new commits)
Recent changes:
...
Do you want to update to the latest version? (y/N): 
```
Type `n` and press Enter.
Expected behavior:
Prints "Continuing with current version..." and continues with Node/dependency checks.

- [ ] **Step 4: Verify the update detection and acceptance**

1. Run the deployment script again and accept the update:
```bash
./deploy.sh
```
Type `y` and press Enter.
Expected behavior:
Prints "Updating repository (git pull)..." and "Update successful!".
2. Confirm the repository is back to the latest commit:
```bash
git rev-parse HEAD
```
Expected output:
Must match the backup commit ID (`$CURRENT_HEAD`).

- [ ] **Step 5: Commit**

```bash
git add deploy.sh
git commit -m "feat: add git-native update checking and basic pull prompt to deploy.sh"
```


### Task 2: Implement Local Changes Handling (Stashing / Discarding)

**Files:**
- Modify: `deploy.sh` (inside the update logic block)

- [ ] **Step 1: Implement local modifications handler**

Modify the update block in `deploy.sh` to check for uncommitted changes and present handling choices:

```bash
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
```

- [ ] **Step 2: Verify the "stash and restore" option**

1. Set local branch back by 1 commit:
```bash
git reset --hard HEAD~1
```
2. Modify a tracked file locally (e.g. add a line to `README.md`):
```bash
echo "# Mock Modification" >> README.md
```
3. Run the script and choose Option 1 (git stash):
```bash
./deploy.sh
```
When prompted to update, type `y`.
When warned about local changes, type `1`.
Expected behavior:
Stashes changes, pulls successfully, restores changes via stash pop.
4. Verify changes in `README.md` are restored:
```bash
tail -n 2 README.md
```
Expected output:
Contains `# Mock Modification`.

- [ ] **Step 3: Verify the "discard" option**

1. Set local branch back by 1 commit again:
```bash
git reset --hard HEAD~1
```
2. Modify `README.md` again:
```bash
echo "# Another Mock Modification" >> README.md
```
3. Run the script and choose Option 2 (discard):
```bash
./deploy.sh
```
When prompted to update, type `y`.
When warned about local changes, type `2`.
Expected behavior:
Discards local changes, pulls successfully.
4. Verify changes in `README.md` are gone:
```bash
tail -n 2 README.md
```
Expected output:
Does NOT contain `# Another Mock Modification`.

- [ ] **Step 4: Verify the "cancel" option**

1. Set local branch back by 1 commit again:
```bash
git reset --hard HEAD~1
```
2. Modify `README.md` again:
```bash
echo "# Final Mock Modification" >> README.md
```
3. Run the script and choose Option 3 (cancel):
```bash
./deploy.sh
```
When prompted to update, type `y`.
When warned about local changes, type `3`.
Expected behavior:
Prints "Update cancelled. Continuing with current version..."
4. Verify `README.md` changes are preserved:
```bash
tail -n 2 README.md
```
Expected output:
Contains `# Final Mock Modification`.
5. Restore repository status:
```bash
git reset --hard origin/$(git branch --show-current)
```

- [ ] **Step 5: Commit**

```bash
git add deploy.sh
git commit -m "feat: handle uncommitted local changes on update in deploy.sh"
```
