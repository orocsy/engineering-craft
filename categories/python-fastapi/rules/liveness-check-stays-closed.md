---
title: Liveness Checks Stay Dumb and Closed
maturity: draft
impact: MEDIUM
impact-description: |
  `/health` is unauthenticated by design and is the first URL scanners probe. Health
  handlers grow fields over time (version, hostname, DB URL, git SHA) that map the
  deployment for an attacker. A liveness probe that calls the database also turns a DB
  blip into a restart storm, because the orchestrator kills healthy processes.
tags: health, liveness, readiness, kubernetes, load-balancer, information-disclosure, fastapi
applies-to: |
  Any service exposing a health endpoint to load balancers, orchestrators or uptime checks.
related-rules:
  - app-factory-not-import-time-app
historical-incidents:
  - KidsBuddy MIU-B01 (2026-10): /health was specified as "no secrets, no internal config, no database address"; the test pins the exact body so new fields fail CI
---

## The rule

- Liveness (`/health` or `/health/live`) returns a fixed body such as `{"status": "ok"}`.
  It calls no dependency and reveals no version, host, config or environment.
- Readiness (`/health/ready`) is a separate route that checks dependencies. Add it when
  there are dependencies to check (see observability/README.md, "three pillars").
- Keep health routes outside the versioned business prefix (`/health`, not `/v1/health`)
  and outside auth.

## Test

```python
assert response.json() == {"status": "ok"}   # exact equality: any new field fails
```

`response.json()["status"] == "ok"` is not enough, because it lets added fields through.
