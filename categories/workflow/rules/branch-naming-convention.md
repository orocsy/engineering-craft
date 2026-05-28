---
title: Use feat/fix/chore/docs Prefix; NEVER Use claude/* For Auto-Spawned Branches
last-referenced: 2026-05-12
maturity: verified
type: guideline
impact: MEDIUM
impact-description: |
  Branch names should match commit-scope vocabulary so the scope can be inferred from
  the branch name. Auto-spawned `claude/<name>` worktree branches must be renamed
  BEFORE first push so PR titles and squash commits stay consistent with project conventions.
tags: workflow, git, branching, naming
applies-to: |
  Creating any new branch. Especially renaming auto-spawned `claude/<name>` worktree
  branches before the first push.
related-rules:
  - pull-main-before-branching
historical-incidents:
  - A directive from review ("rename auto-spawned claude/<name> worktree branches BEFORE first push")
---

## The convention

| Prefix | Use for |
|--------|---------|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `chore/` | Tooling, deps, refactors that don't add features |
| `docs/` | Doc-only changes |
| `hotfix/` | Production-urgency fix |
| `infra/` | CI/CD, deployment, infra |

Examples:
- `feat/owner-password-reset` ✓
- `fix/api-secret-literal-fallback` ✓
- `chore/upgrade-deps` ✓
- `claude/foo` ✗ (auto-spawned, rename before push)
- `my-branch` ✗ (no scope prefix)
- `alice/feature` ✗ (personal namespace, use scope instead)

## When the harness auto-spawns a branch

If a worktree spawned with `claude/<name>` (Claude Code's default for some flows), rename
BEFORE the first push:

```bash
git branch -m claude/foo feat/foo
git push -u origin feat/foo
```

If you've already pushed `claude/foo` to origin, fix the remote too:

```bash
git push origin :claude/foo               # delete remote
git push -u origin feat/foo               # push the renamed branch
```

The PR title (and squash-commit subject) should follow the same `scope: description`
vocabulary as the commit messages.

## Anti-patterns

- `claude/foo` reaches main — squash commit subject reads `claude/foo` as the branch
  name; PR scope is invisible
- `alice/feature` — personal namespace; the scope (feat/fix/chore) carries more info
- `WIP-foo` — vague; pick a scope and a noun phrase
