# Healthy on the box ≠ reachable by users — gate both

**Category**: deploy-delivery
**First seen**: 2026-05 in `luxebook` (tunnel scar; encoded as the commented public-gate step in `coachflow` `deploy-api.yml`)
**Risk**: P1 — a green deploy that no user can reach

## The Lesson

An on-box health gate (`curl localhost:3001/health`) proves the container
boots. It proves nothing about the public path: a down tunnel connector, a
STALE host's connector still serving the tunnel, DNS, or an edge cert can leave
a "green" deploy publicly dark. The deploy needs a second gate through the
public hostname — and until that hostname exists, the gap must be a NAMED,
commented absence in the workflow, not an unknown.

## Why It Happens

The box gate is easy and local; the public path involves infrastructure someone
else owns (tunnel, DNS, CDN), so it gets skipped — exactly where failures hide.

## The Fix

```yaml
# ✅ Both gates, in order
- name: On-box health gate      # container booted
  run: curl -fsS http://localhost:3001/health
- name: Public gate             # users can actually reach it
  run: curl -fsS https://api.<domain>/health
# (interim era: keep the public gate present-but-commented WITH the reason,
#  so cutover flips a comment instead of remembering a lesson)
```

## Examples

- 2026-05 (`luxebook`) — on-box-healthy deploy publicly dark: a stale host's tunnel
  connector was serving the hostname.
- 2026-08-01 (`coachflow:477f28d`) — public gate carried as a commented step naming the
  LuxeBook scar; activates at domain cutover per the runbook checklist.
