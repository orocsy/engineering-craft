---
title: .dockerignore Bare Patterns Match the Context Root Only — Nested Secrets Need `**/`
maturity: verified
impact: CRITICAL
impact-description: |
  A .dockerignore with `.env` / `.env.*` looks like it excludes env files, but
  bare patterns match only at the build-context ROOT. A nested
  apps/<service>/.env (real secrets) survived the context, and the deploy step
  flattened it to /app/.env inside the runtime image. Any local
  `docker build` would have shipped production secrets in a pushable image.
tags: docker, dockerignore, secrets, monorepo, footgun
applies-to: |
  Every monorepo Dockerfile build. Any .dockerignore intended to exclude a
  file class (env files, keys, local configs) that can exist in nested
  directories.
related-rules: []
historical-incidents:
  - a real incident: nested <app>/.env survived `.env`/`.env.*` ignore patterns and was flattened into the runner image at /app/.env; caught by a deploy-parity smoke that scanned the built image
---

## The footgun

`.dockerignore` syntax LOOKS like `.gitignore` but differs on the one property
everyone assumes: a bare pattern (`.env`) matches **only the context root**,
not nested paths. `.gitignore` matches at every level; `.dockerignore` does
not. In a monorepo, the secrets live nested (`apps/api/.env`) — exactly where
the bare pattern doesn't reach.

Worse, packaging steps that flatten an app directory (e.g. `pnpm deploy`)
relocate the nested file to the image's app root, so the leaked file ends up
at the most discoverable possible path.

## Correct pattern

```dockerignore
**/.env
**/.env.*
!**/.env.example
!**/.env.*.example
```

## Verify with the image, not the file

The ignore file lies by omission; the built image doesn't. After any
.dockerignore change (and periodically in CI):

```bash
docker build -t probe . && docker run --rm probe find / -name ".env*" -not -name "*.example" 2>/dev/null
# expected output: NOTHING
```

This is the deploy-parity smoke that caught the real incident — the scan runs
against the artifact you actually ship.

## Anti-patterns

- Copying `.gitignore` semantics into `.dockerignore` assumptions.
- Trusting "CI images are clean" — CI runners often have no local .env, so the
  leak only exists in locally-built images, which are still pushable.
- Excluding by enumerating app dirs (`apps/api/.env`) — the next app re-leaks.
