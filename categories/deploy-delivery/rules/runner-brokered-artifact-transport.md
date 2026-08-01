# Before minting any long-lived machine credential, let the runner broker the artifact

**Category**: deploy-delivery
**First seen**: 2026-08-01 in `coachflow` (`477f28d`)
**Risk**: P1 — a standing PAT is a credential to mint, store, rotate, and leak, forever

## The Lesson

A deploy target pulling from a private registry seems to require a long-lived
token (GHCR read:packages PAT) as a host or CI secret. Usually it doesn't: the
CI runner's own per-run `GITHUB_TOKEN` can read the same repo's packages, so the
runner pulls, `docker save`s, ships the tarball over the SSH channel that already
exists, and the host `docker load`s it. The host never authenticates to any
registry, and the credential class never exists. Cost: ~1 min of scp per deploy.

## Why It Happens

The "box pulls image" topology is the default mental model, so the PAT feels
mandatory. Nobody prices in that a human must mint it in a web UI, that it lives
unrotated for years, and that its scope usually exceeds one package.

## The Fix

```yaml
# ❌ Wrong — standing PAT delivered to the box
- run: echo "${{ secrets.GHCR_TOKEN }}" | docker login ghcr.io --password-stdin  # on the box

# ✅ Right — per-run token on the runner; box gets a tarball
- run: |
    echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u "${{ github.actor }}" --password-stdin
    docker pull "$IMAGE" && docker save -o api-image.tar "$IMAGE" && chmod 644 api-image.tar
# then scp the tar; on the box: docker load -i api-image.tar
```

## Examples

- 2026-08-01 (`coachflow:477f28d`) — `GHCR_TOKEN` retired before ever being minted;
  job permissions `packages: read`; first-run linkage assumption verified live same day.

## See also

- [build-artifact-perms-cross-uid](build-artifact-perms-cross-uid.md) — the 0600 scar this transport exposed.
