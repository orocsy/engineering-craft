# `.dockerignore` needs `**/.env` — nested env files ride into images

**Category**: deploy-delivery
**First seen**: 2026-05-28 in `luxebook` (`7cd0333`)
**Risk**: P0 — production secrets baked into a registry-distributed artifact

## The Lesson

A root-level `.env` line in `.dockerignore` excludes only the repo root. In a
monorepo, `apps/api/.env` (real local secrets) sails straight into the build
context and the image — which then travels to a registry, other machines, and
every `docker save` tarball. The pattern must be `**/.env` (plus variants like
`**/.env.*`), and the check belongs in review whenever a Dockerfile's context is
the workspace root.

## Why It Happens

`.dockerignore` syntax looks like `.gitignore` but does not inherit git's
per-directory semantics people assume; the leak is invisible until someone
inspects image layers.

## The Fix

```gitignore
# ❌ Wrong — excludes only the root file
.env

# ✅ Right — excludes every nested env file from the build context
**/.env
**/.env.*
!**/.env.example
```

## Examples

- 2026-05-28 (`luxebook:7cd0333`) — nested `apps/api/.env` leaked into the main API
  image; caught and fixed with the `**/.env` form.
- 2026-08 (`coachflow`) — same-shape defense: dependency-filtered image build plus
  env delivered at run time via env_file, never baked.

## See also

- `tooling-footguns` carries the `.dockerignore` context-root syntax scar; this rule
  is its image-supply-chain consequence.
