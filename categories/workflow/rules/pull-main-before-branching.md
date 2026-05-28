---
title: Always Pull Latest Main Before Creating a New Branch
last-referenced: 2026-05-12
maturity: verified
type: process
impact: HIGH
impact-description: |
  Squash-merges break local-history assumptions. If you branch from local main without
  fetching first, your branch may diverge from origin/main in subtle ways that surface
  only at PR merge time as confusing conflict resolution.
tags: workflow, git, branching, squash-merge
applies-to: |
  Starting any new branch from main, especially after another PR was just merged.
related-rules:
  - branch-naming-convention
historical-incidents:
  - A production domain cutover — branched off stale main, had to rebase
---

## The discipline

Before every `git checkout -b feat/foo`:

```bash
git checkout main
git fetch origin
git pull --ff-only origin main   # fail loud if local diverged
git checkout -b feat/foo
```

The `--ff-only` flag refuses to fast-forward if local main has commits that aren't in
origin/main. That's the loud signal that something is off — investigate before branching.

## Why squash-merge breaks naive branching

When PR #N is merged via squash:
- All N commits on the feature branch become a single new commit on main
- The original feature commits are NOT in main's history
- Your local main, if you fetched before the squash, has a different history view
- A new branch from your stale local main will replay the original feature commits
  during a future rebase against new main, causing surprising conflicts

Always pull fresh.

## Tooling support

If you forget, the pre-push hook can detect "branch is N commits behind origin/main"
and warn:

```bash
# pre-push hook fragment
BEHIND=$(git rev-list --count HEAD..origin/main)
if [ "$BEHIND" -gt 5 ]; then
  echo "WARN: $BEHIND commits behind origin/main; consider rebasing"
fi
```

But the discipline is to pull at branch creation, not catch at push time.

## Anti-patterns

- "I'll just rebase later if there's a conflict" — rebases on stale base are the
  conflicts you'd avoid by branching fresh
- "git status looks clean, that's enough" — clean working tree ≠ updated branch ref
- "Last `pull` was an hour ago, fine" — in a fast-moving repo, an hour is multiple PRs
