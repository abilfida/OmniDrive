# Publish Release Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `publish-release` skill documentation and execute it to publish the v0.7.1 patch release with synchronized documentation.

**Architecture:** The skill relies on analyzing recent `git log`, formatting a comprehensive `CHANGELOG.md`, reflecting structural changes to `README`s, and executing standard NPM versioning and Git tagging commands.

**Tech Stack:** Git, Markdown, NPM.

---

### Task 1: Create the Skill Documentation

**Files:**
- Create: `docs/superpowers/skills/publish-release.md`

- [ ] **Step 1: Write the Skill Documentation**

Create `docs/superpowers/skills/publish-release.md` with the following content:

```markdown
# Publish Release Skill

Execute this skill to prepare documentation and release a new version.

## Phase 1: Context Gathering
1. Read the current version from `package.json`.
2. Extract all commits since the last tag: `git log <latest_tag>..HEAD --oneline`.
3. Scan modified files to identify major workflow or architectural changes.

## Phase 2: Documentation Updates
1. **CHANGELOG.md**: Add a new unreleased/version block categorizing commits into `Added`, `Changed`, and `Fixed`.
2. **READMEs**: Update `README.md` and `README.id.md` if recent commits introduce new configurations, workflows, or requirements.

## Phase 3: Review Gate
Stop and present the proposed documentation diffs to the user. Do NOT proceed to Phase 4 until the user explicitly approves.

## Phase 4: Release Execution
Once approved:
1. Bump version: `npm version patch --no-git-tag-version` (or minor/major based on user request).
2. Stage docs: `git add package.json package-lock.json CHANGELOG.md README.md README.id.md`
3. Commit: `git commit -m "chore(release): vX.Y.Z"`
4. Tag: `git tag vX.Y.Z`
5. Remind user to push: `git push --follow-tags`
```

- [ ] **Step 2: Verify creation**

Run: `cat docs/superpowers/skills/publish-release.md`
Expected: The file content is printed.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/skills/publish-release.md
git commit -m "docs(skills): add publish-release skill definition"
```

### Task 2: Extract Data & Prepare Documentation (Simulating Phase 1 & 2)

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md` (if necessary)
- Modify: `README.id.md` (if necessary)

- [ ] **Step 1: Extract Git Commits**

Run: `git log v0.7.0..HEAD --oneline` (assuming v0.7.0 is the latest tag). Gather the commits related to "Docker Sync Resilience" and the new SKILL.

- [ ] **Step 2: Update CHANGELOG.md**

Update `CHANGELOG.md` by inserting a new section `## [0.7.1] - <current-date>` below the `## [Unreleased]` block. Add the recent commits categorized under `### Added`, `### Changed`, or `### Fixed`.
Code modifications depend on the actual git log, but ensure the structure follows Keep a Changelog.

- [ ] **Step 3: Update READMEs**

If the "Docker Sync Resilience" changes require updating the `README.md` and `README.id.md` (e.g., mentioning that syncs are now resume-able and OOM-safe in Docker environments), make those modifications.

- [ ] **Step 4: Verify formatting**

Run: `grep -A 10 "0.7.1" CHANGELOG.md`
Expected: Shows the new version block.

- [ ] **Step 5: Pause for Review (Simulating Phase 3)**

**WAIT HERE**. The agent must present the `CHANGELOG.md` and `README` diffs to the user and ask for approval. Do NOT proceed to Task 3 until the user says "Approve".

### Task 3: Release Execution (Simulating Phase 4)

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump the version**

Run: `npm version patch --no-git-tag-version`
Expected: Updates `package.json` and `package-lock.json` to `0.7.1`.

- [ ] **Step 2: Stage files**

```bash
git add package.json package-lock.json CHANGELOG.md README.md README.id.md
```

- [ ] **Step 3: Commit the release**

```bash
git commit -m "chore(release): v0.7.1"
```

- [ ] **Step 4: Tag the release**

```bash
git tag v0.7.1
```

- [ ] **Step 5: Verify Tag**

Run: `git tag -l "v0.7.1"`
Expected: `v0.7.1`

- [ ] **Step 6: Report Completion**

Print: "Release v0.7.1 tagged successfully. Remember to run `git push --follow-tags`."
