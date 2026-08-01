# `npx --no-install` from the workdir that resolves the pinned CLI

**Category**: deploy-delivery
**First seen**: 2026-05 in `luxebook` (Prisma 7-vs-6 scar; encoded in `coachflow` `deploy-api.yml` migrate step)
**Risk**: P1 — migrations run by a DIFFERENT major version than the app was built against

## The Lesson

`npx <cli>` from a directory where the CLI isn't locally installed silently
downloads LATEST — so a deploy-time `npx prisma migrate deploy` from the wrong
workdir can run Prisma 7 against a Prisma 6 app. Two pins together: `--no-install`
(fail instead of fetch) and `--workdir` set to the package whose lockfile pins
the CLI. The failure mode without them is not an error — it is a successful run
of the wrong tool.

## Why It Happens

npx's fetch-on-miss is convenience-by-default; inside a filtered production
image, the CLI often exists only under the app package, not the root.

## The Fix

```bash
# ❌ Wrong — /app has no local prisma → npx downloads latest
docker compose run --rm api npx prisma migrate deploy

# ✅ Right — resolve the PINNED CLI or fail loudly
docker compose run --rm --no-deps --workdir /app/apps/api api \
  npx --no-install prisma migrate deploy
```

## Examples

- 2026-05 (`luxebook`) — latest-Prisma download caught by the local prod-parity
  stack's first boot.
- 2026-08-01 (`coachflow:477f28d`) — carried verbatim into the redesigned chain with
  the reasoning inline.
