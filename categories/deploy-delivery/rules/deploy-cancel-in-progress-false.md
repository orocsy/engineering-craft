# Deploy concurrency groups never cancel in-progress

**Category**: deploy-delivery
**First seen**: 2026-05 in `luxebook` (`deploy.yml` scar; encoded in `coachflow` `deploy-api.yml` from birth)
**Risk**: P1 — a half-deploy is an undefined container state

## The Lesson

CI concurrency groups default-cancel superseded runs — right for builds and
tests, wrong for deploys. A deploy canceled between "old container stopped" and
"new container healthy" leaves the host in a state no runbook describes.
Deploys run to completion; a newer merge waits its turn (GitHub keeps the newest
pending run, so the final state still converges to the latest merge).

## Why It Happens

`cancel-in-progress: true` is copy-pasted from the CI workflow above it, where
cancellation is pure savings.

## The Fix

```yaml
# ❌ Wrong — a rapid second merge cancels a mid-flight deploy
concurrency:
  group: deploy
  cancel-in-progress: true

# ✅ Right — deploys are atomic from the pipeline's point of view
concurrency:
  group: deploy-api
  cancel-in-progress: false
```

## Examples

- 2026-05 (`luxebook`) — the original mid-deploy cancel scar.
- 2026-08-01 (`coachflow:477f28d`) — carried verbatim into the redesigned chain; under
  chained merges the newest pending run supersedes older PENDING ones only.
