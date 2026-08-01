# Compose recreates ANY changed service — scope deploys to the service you own

**Category**: deploy-delivery
**First seen**: 2026-08-01 in `coachflow` (`477f28d`, review HIGH) · roots in the 2026-07-24 cutover rounds (`1f22674`, `75170a9`)
**Risk**: P0 — live-database restarts on every deploy, silent loss of resource caps

## The Lesson

`docker compose up -d` reconciles EVERY service in the file against a config
hash of what's running. If the box runs an interim/hand-tuned stack (extra
mem_limits, different healthcheck cadence, edge container), a deploy using the
committed compose file recreates postgres/redis too — a live-DB blip on every
deploy and permanent loss of the caps. `--remove-orphans` is a different knob
entirely; NOT passing it does not protect changed services. Scope routine
deploys to the owned service; the full-graph `up` is a deliberate cutover event.

## Why It Happens

The author reasons about orphan REMOVAL (will my edge container die?) and never
about config-hash RECREATION of shared services. Both compose files "describe
the same postgres", so the drift is invisible until the first live run bounces it.

## The Fix

```bash
# ❌ Wrong — reconciles postgres/redis against a file the box doesn't run
docker compose -f ec2-compose.yml up -d

# ✅ Right — interim deploys own only the api; cutover is explicit
docker compose -f ec2-compose.yml run --rm --no-deps api npx --no-install prisma migrate deploy
docker compose -f ec2-compose.yml up -d --no-deps api
# cutover dispatch only: up -d --remove-orphans   (the one deliberate full apply)
```

## Examples

- 2026-08-01 (`coachflow:477f28d`) — assumption-checker caught bare `up -d` recreating
  postgres/redis (mem_limit + healthcheck drift vs the interim file) before first run.
- 2026-07-24 (`coachflow:1f22674`) — orphan removal cutover-gated so interim Caddy
  survives routine deploys; (`75170a9`) volume keys matched to the live box so cutover
  keeps the production database.

## See also

- [env-write-guard](env-write-guard.md) — the same "don't clobber the box's reality" stance for env.
