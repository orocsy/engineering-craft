# `docker save -o` writes 0600 — the next step's container uid can't read it

**Category**: deploy-delivery
**First seen**: 2026-08-01 in `coachflow` (`0c0651a`, first live chain run 30690446280)
**Risk**: P2 — loud first-run failure, but a confusing one without this prior

## The Lesson

`docker save -o file.tar` creates the tarball mode 0600 owned by the invoking
user. Container-based actions (appleboy/scp-action et al.) run as a different
uid with the workspace bind-mounted — `tar: can't open: Permission denied`.
Any artifact handed from a `run:` step to a container action needs
world-readable perms; a build artifact is not a secret, so `chmod 644` is
correct, not a workaround.

## Why It Happens

The 0600 default is invisible locally (same user reads it fine) and only
surfaces when a cross-uid consumer appears — i.e., on the first real CI run.

## The Fix

```bash
# ❌ Wrong — works locally, fails in the container action
docker save -o api-image.tar "$IMAGE"

# ✅ Right — artifact readable by the next step's uid
docker save -o api-image.tar "$IMAGE"
chmod 644 api-image.tar
```

## Examples

- 2026-08-01 (`coachflow:0c0651a`) — first chain run failed exactly here (named
  watch-item #3 in the arming PR); one-line fix merged, chain re-fired itself green.
