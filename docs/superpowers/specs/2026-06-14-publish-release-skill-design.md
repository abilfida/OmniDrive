# Publish Release Skill Design

## Overview
This design defines a new AI workflow SKILL (`/superpowers:publish-release`) to automate the preparation and execution of software releases. It ensures that documentation (like `README.md` and `CHANGELOG.md`) stays perfectly in sync with codebase changes before a new Git tag is created.

## Goal
To safely automate patch releases by extracting git logs, updating all relevant documentation, requiring human approval, and executing the version bump and git tag.

## Workflow Phases

### Phase 1: Preparation & Data Extraction
- **Read Version**: Read the current `version` from `package.json`.
- **Extract Commits**: Execute `git log <latest_tag>..HEAD` to gather all changes since the last release.
- **Context Gathering**: Scan the changed files to understand if structural or workflow changes occurred.

### Phase 2: Documentation Updates
- **CHANGELOG.md**: Parse the gathered commits and format them into standard sections (`Added`, `Fixed`, `Changed`) under a new unreleased/version block.
- **README Synchronization**: Evaluate if the recent commits introduced changes that affect usage, installation, or architecture. If so, apply the necessary updates to `README.md` and `README.id.md`.

### Phase 3: The Human Review Gate
- **Hard Gate**: The skill MUST pause and present the proposed documentation changes (diffs for the CHANGELOG and READMEs) to the user.
- No versioning or tagging is allowed until the user explicitly approves the documentation updates.

### Phase 4: Release Execution
Once approved:
1. **Bump Version**: Update `package.json` with the new patch version.
2. **Commit**: Stage the updated `package.json`, `CHANGELOG.md`, and READMEs. Commit with the standard message: `chore(release): vX.Y.Z`.
3. **Tag**: Execute `git tag vX.Y.Z`.
4. **Conclusion**: Remind the user to push the newly created tag to the remote repository (`git push --follow-tags`).

## Target Files
- `package.json`
- `CHANGELOG.md`
- `README.md`
- `README.id.md`
- `skills/publish-release.md` (the actual skill definition file to be implemented)
