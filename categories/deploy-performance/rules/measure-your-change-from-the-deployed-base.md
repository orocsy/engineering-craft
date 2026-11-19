# Measure your own change from what is deployed, not from a busy release head

**Category**: deploy-performance
**First seen**: 2026-11-11 in `channel` (PR #82)
**Risk**: P1 — a measurement deploy that also ships other people's unreleased work

## The Lesson

The release branch was 26 commits ahead of the deployed `test` branch, including
undeployed site and assistant changes from other sessions. Deploying the release head to
time a speed change would have shipped all of that, and mixed its effects into the
measurement. Branching from `test` and fast-forwarding `test` to that branch deploys
exactly one change; it merges into the release branch afterwards.

A related trap: PR CI tests the merge with the base branch. When the base itself is red
(here, two unformatted files from another contributor), your PR shows red for problems
that are not in your diff. Check which files the failure names before changing anything.

## Why It Happens

The release branch is where work "goes", so it looks like the natural base. On a shared
release flow it is also where unfinished work waits.

## The Fix

```bash
git log --oneline origin/test..origin/release   # what deploying the release head would add
git switch -c perf/x origin/test                 # base the measured change on what is live
```

Fast-forward the deploy branch to your branch only, measure, then merge into the release
branch.

## Examples

- 2026-11-11 (`channel` #82) — branch based on `test`; the PR's lint failure came from
  release-branch files outside the diff.
