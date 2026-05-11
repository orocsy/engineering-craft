---
name: production-defensive-patterns
description: |
  Production-grade defensive engineering patterns distilled from real post-merge incidents. Covers concurrency
  & compare-and-swap (Redis Lua / Postgres WHERE-predicate), enumeration safety (status + timing oracles),
  config drift (env-schema / deploy.yml / runbook 4-consumer rule), silent no-op integrations, and grep-for-siblings.
  USE THIS PROACTIVELY when designing or reviewing ANY of:
  authentication, password reset, OTP, single-use tokens, session invalidation, multi-tenant queries with shared
  identifiers (email, phone), endpoints that must not leak account existence, environment variables, third-party
  API integrations (Resend/Twilio/Stripe/OAuth), security secrets, anything that mutates shared state from >1
  entry point, anything where two concurrent requests could interleave. Trigger keywords: forgot-password,
  reset-password, otp, jwt, token, hmac, single-use, consume, invalidate, race, cas, compare-and-swap, lua,
  updateMany, optimistic, lock, tenantId, findFirst, enumeration, timing-oracle, env.schema, deploy.yml,
  third-party API key.
license: MIT
metadata:
  author: luxebook
  version: "2.0.0"
  source-incidents: PR#85 (5 review rounds, 11 findings), PR#86 (deploy regression), PR#87 (CORS fail-closed)
---

# Production Defensive Patterns

Distilled from real LuxeBook production incidents where automated and human review missed
defects that cost multi-day fix cycles. **Every rule here cites a historical incident SHA**
so future readers can trace the decision back to evidence, not opinion.

## When to apply (BLOCKING — read this section before reviewing or implementing)

Apply this skill **proactively, before writing code**, in these situations:

| Situation | Mandatory categories to consult |
|-----------|--------------------------------|
| Designing/changing auth, OTP, password reset, session, JWT | concurrency-cas, enumeration-safety, silent-no-op-integrations |
| Endpoint that must not reveal account existence | enumeration-safety |
| Mutating shared state from >1 entry point (link + OTP, web + API, multiple roles) | concurrency-cas |
| Adding/changing env var or secret | config-drift, grep-for-siblings |
| Integrating third-party API (Resend/Twilio/Stripe/S3/OAuth) | silent-no-op-integrations, config-drift |
| Multi-tenant query with email/phone/handle | concurrency-cas (fail-closed on ambiguity), enumeration-safety |
| Pre-merge self-review of any branch above | checklists/pre-merge-self-review.md (RUN THIS) |

If you skip this skill while working on the above, you are signing up for a multi-round
post-merge fix cycle. Real cost data: PR#85 had 5 review rounds, ~30 hours total,
because state-machine + race-test design were skipped at G2.

## Trigger checklist (use as a gate, not a suggestion)

Before declaring "implementation done" on a feature in any of the above categories, the
implementer MUST be able to point at:

1. ☐ **State-machine drawing** for any resource with shared mutable state (Redis key, single-use token, session row). See `categories/concurrency-cas/rules/state-machine-first.md`.
2. ☐ **Race-test contract** — for every shared-state mutation, a `Promise.allSettled` test that asserts `exactly one fulfilled` (not "two errors", not "one wins" — exact count). See `templates/race-test.template.ts`.
3. ☐ **Storage-layer atomic gate** — for every "consume once" or "CAS on value" operation, the gate is in the storage primitive (Lua / WHERE predicate), not in JS. See `categories/concurrency-cas/rules/storage-gate-not-js.md`.
4. ☐ **Status + timing parity** — for any endpoint that branches on a sensitive condition, both status and timing are equal across branches under success AND failure conditions (Resend down, DB unavailable, etc.). See `templates/enumeration-test-suite.template.ts`.
5. ☐ **Env consumer audit** — for every env var added or changed: env.schema.ts, deploy.yml, .env.example, runbook, test fixtures all updated in the SAME commit. See `categories/config-drift/rules/four-consumer-rule.md`.
6. ☐ **Sibling grep** — for every security-relevant literal removed/changed: grep repo for siblings, apply consistently. See `categories/grep-for-siblings/rules/security-literal-grep.md`.
7. ☐ **Integration mode log** — for every new third-party API wrapper: prints `LIVE`/`DISABLED` at boot, hard-fails in prod if disabled. See `categories/silent-no-op-integrations/rules/configured-state-visible.md`.

If any box is unchecked, do NOT mark the feature ready for review. Loop back.

## Categories

| Category | Index | Rule count | When it bites |
|----------|-------|-----------|---------------|
| Concurrency & CAS | [categories/concurrency-cas/README.md](categories/concurrency-cas/README.md) | 6 | Two requests interleave; one silently overwrites the other |
| Enumeration safety | [categories/enumeration-safety/README.md](categories/enumeration-safety/README.md) | 4 | Attacker discovers which emails exist by status/timing diff |
| Config drift | [categories/config-drift/README.md](categories/config-drift/README.md) | 4 | Env added in one consumer, missing in others → boot crash |
| Silent no-op integrations | [categories/silent-no-op-integrations/README.md](categories/silent-no-op-integrations/README.md) | 3 | Third-party wrapper "succeeds" while doing nothing |
| Grep-for-siblings | [categories/grep-for-siblings/README.md](categories/grep-for-siblings/README.md) | 2 | Security literal removed in one file, lingers in two more |

## Templates (copy-paste ready)

| Template | Purpose | Path |
|----------|---------|------|
| Race test (Promise.allSettled) | Prove exactly-one-fulfilled for shared-state mutations | [templates/race-test.template.ts](templates/race-test.template.ts) |
| Lua CAS-and-delete | Atomic compare-on-value-then-delete in Redis | [templates/lua-cas-and-delete.template.ts](templates/lua-cas-and-delete.template.ts) |
| Lua CAS-and-increment | Atomic compare-on-value-then-increment with TTL | [templates/lua-cas-and-increment.template.ts](templates/lua-cas-and-increment.template.ts) |
| Postgres optimistic CAS | tokenVersion `updateMany WHERE version = ?` predicate | [templates/postgres-optimistic-cas.template.ts](templates/postgres-optimistic-cas.template.ts) |
| Enumeration test suite | Status + timing + outage-parity tests for forgot-password style endpoints | [templates/enumeration-test-suite.template.ts](templates/enumeration-test-suite.template.ts) |
| Env-schema/deploy.yml parity test | CI test that fails if env var added to schema but missing from deploy.yml | [templates/env-deploy-parity.spec.template.ts](templates/env-deploy-parity.spec.template.ts) |
| Integration boot-mode log | Stdout `LIVE`/`DISABLED` line for every third-party wrapper | [templates/integration-boot-log.template.ts](templates/integration-boot-log.template.ts) |

## Checklists

| Checklist | When to run |
|-----------|-------------|
| [Pre-merge self-review](checklists/pre-merge-self-review.md) | Before pushing any branch in trigger categories |
| [New env var](checklists/new-env-var.md) | Adding/changing any config value |
| [New third-party integration](checklists/new-third-party-integration.md) | Wrapping any external API |
| [Auth/OTP/password feature](checklists/auth-otp-feature.md) | Designing any credential flow |

## References (authoritative external sources)

| Topic | Source |
|-------|--------|
| Redis Lua atomicity | https://redis.io/docs/latest/develop/interact/programmability/eval-intro/ |
| Postgres READ COMMITTED & UPDATE re-evaluation | https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED |
| Prisma `updateMany` for CAS | https://www.prisma.io/docs/orm/reference/prisma-client-reference#updatemany |
| OWASP enumeration safety | https://owasp.org/www-community/attacks/Account_Enumeration |
| OWASP timing attacks | https://owasp.org/www-community/attacks/Timing_attacks |
| NIST password reset (SP800-63B §5.1.1.2) | https://pages.nist.gov/800-63-3/sp800-63b.html |
| `bcrypt` constant-time compare | https://github.com/kelektiv/node.bcrypt.js#a-note-on-timing-attacks |

## How this skill stays alive

- `~/.claude/hooks/post-codex-fix-extract-lesson.sh` appends a JSONL entry to
  `~/.claude/lessons-journal/codex-fixes.jsonl` after every commit matching review-fix
  patterns.
- `/dev-pipeline:consolidate-lessons` (run every 2 days via cron) reads the journal,
  groups by class, fetches actual diffs via `git show <sha>`, refines the rules in this
  skill, and pushes to the public learnings repo.
- The pre-merge checklist at `checklists/pre-merge-self-review.md` is the LAST thing the
  implementer reads before `git push`.

## Anti-patterns flagged across all categories

| Anti-pattern | What's wrong | Where it hurts |
|--------------|--------------|---------------|
| "I'll just check the value in JS before writing" | Race window unchanged | concurrency-cas |
| "I'll use SET XX to be safe" | Only protects existence, not value | concurrency-cas |
| "I'll add a per-token gate" | Doesn't help when N tokens lead to ONE write | concurrency-cas |
| "I'll use a transaction" | Isolation alone doesn't add a CAS predicate | concurrency-cas |
| "It's behind a rate limit so the race is impossible" | Rate limits gate request rate, not parallel concurrency from a single attacker | concurrency-cas |
| "I'll let 503 propagate so ops can see Resend is down" | Leaks account existence | enumeration-safety |
| "Email send is fast enough that the timing diff doesn't matter" | 300-2000ms variance is not subtle | enumeration-safety |
| "I'll use findFirst for performance" | Same email across tenants is allowed; pick wrong → hijack | enumeration-safety |
| "An attacker can't time individual responses precisely" | With 1000 samples + statistics, sub-100ms is detectable | enumeration-safety |
| "I'll add the schema check now and update deploy.yml later" | Deploy.yml IS code; deferred updates never happen | config-drift |
| "The runbook is just docs, validator doesn't need to match" | Users follow runbook → validator rejects → boot fails | config-drift |
| "I'll grep for the literal later" | Deferred greps never happen | grep-for-siblings |
| "GitHub Secret already exists, so we're fine" | Secret existence ≠ container env exposure | config-drift |
| "Tests pass + lint clean = ready to ship" | False — race-test contract + state-machine drawing are also gates | pre-merge-self-review |
