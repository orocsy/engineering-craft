# workflow_run chains: five sharp edges, including the paths-filter coverage gap

**Category**: deploy-delivery
**First seen**: 2026-08-01 in `coachflow` (`477f28d`, `0c0651a`)
**Risk**: P1 — deploys that silently never fire, or fire on the wrong commit

## The Lesson

Chaining deploy-after-build via `workflow_run` is the right shape for
merge→build→deploy, but it has five edges that each fail quietly: (1) it fires
on EVERY completion of the producer — success, failure, any branch — so the
consumer must gate on `conclusion == 'success' && head_branch == 'main'`;
(2) `inputs` is undefined on workflow_run events — expressions like
`${{ inputs.flag && 'a' || 'b' }}` must degrade safely; (3) secrets cannot
appear in `if:` — route secret → step env → shell check → `GITHUB_OUTPUT`;
(4) checkout must pin `github.event.workflow_run.head_sha` (the event's own ref
is the default branch, not the built commit); (5) **the chain only covers what
the producer's `paths:` filter sees** — the deploy workflow and compose files
must be IN the build's paths, or pipeline changes merge and never deploy
(including the arming merge itself).

## Why It Happens

Each edge is a reasonable-looking default; none errors at authoring time. The
paths gap in particular passes every review that reads one file at a time.

## The Fix

```yaml
# ✅ The consumer's gate
if: >
  github.event_name == 'workflow_dispatch' ||
  (github.event.workflow_run.conclusion == 'success' &&
   github.event.workflow_run.head_branch == 'main')
# ✅ The producer's paths include the pipeline itself
paths: ["apps/api/**", ".github/workflows/deploy-api.yml", "infra/ec2-compose.yml", ...]
```

## Examples

- 2026-08-01 (`coachflow:477f28d`) — all five edges handled at authoring after a
  two-agent review verified each against primary docs; the paths gap was review
  finding P3-2 (the arming merge would not have self-deployed).
