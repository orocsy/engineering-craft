# sha-tagged images never dangle — prune by name, keep the deployed tag

**Category**: deploy-delivery
**First seen**: 2026-08-01 in `coachflow` (`477f28d`, review P2)
**Risk**: P2 — slow disk-death on small hosts; per-deploy artifacts accumulate forever

## The Lesson

`docker image prune -f` removes only UNtagged (dangling) layers. A pipeline that
ships an immutable `sha-<commit>` tag per deploy accumulates a full image per
merge on the host, forever — on a 1 GB/small-disk box that is a countdown. After
a successful health gate, remove every image under the app's name EXCEPT the tag
just deployed, then prune dangling layers; make it best-effort so a busy layer
never fails a green deploy.

## Why It Happens

"We prune" feels handled because `prune` exists; nobody checks that tagged
images are out of its scope.

## The Fix

```bash
# ❌ Wrong — sha-tagged images are not dangling; nothing is freed
docker image prune -f

# ✅ Right — keep only the tag that just passed the health gate
docker images "ghcr.io/org/app" --format "{{.Repository}}:{{.Tag}}" \
  | grep -v ":${IMAGE_TAG}$" | xargs -r docker rmi 2>/dev/null || true
docker image prune -f || true
```

## Examples

- 2026-08-01 (`coachflow:477f28d`) — post-health-gate prune step added at review time;
  tarball-per-deploy transport made the accumulation vector obvious.
