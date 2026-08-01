# Name never-executed assumptions as watch-items; fix the pipeline through the pipeline

**Category**: deploy-delivery
**First seen**: 2026-08-01 in `coachflow` (PR #10 review → PR #11 fix)
**Risk**: P2 — turns "mystery first-run failure" into "expected checkpoint"

## The Lesson

A reviewed-but-never-executed pipeline still carries assumptions no review can
discharge (registry token linkage, an action's path semantics, artifact timing).
List them BY NAME in the PR as first-run watch-items with their expected failure
shape. When the first run fails, diagnosis is a lookup, not an investigation.
And ship the fix as a normal PR through the pipeline itself — the fix's merge
re-fires the chain, proving the fix AND the trigger path in one motion; manual
host surgery would prove neither.

## Why It Happens

Review culture treats "approved" as "verified"; a pipeline's riskiest claims are
only testable by the first live run, and unlabeled they read as random breakage.

## The Fix

```markdown
# ✅ In the arming PR:
## First-run watch items (all loud, runner-side)
1. GHCR package repo-linkage for the GITHUB_TOKEN pull
2. scp-action home-relative target resolution
3. tarball perms/timing            ← first run failed exactly here
```

## Examples

- 2026-08-01 (`coachflow:0c0651a`) — first chain run failed at named watch-item #3
  (`docker save` 0600); mapped in one glance, fixed in one line, merged, and the
  chain's re-fire was itself the regression test.
