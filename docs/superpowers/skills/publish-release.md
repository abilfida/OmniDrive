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
4. Tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
5. Remind user to push: `git push --follow-tags`
