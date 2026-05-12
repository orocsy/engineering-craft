---
name: engineering-craft
description: |
  Distilled engineering craft from real production work — defensive patterns, workflow discipline,
  tooling footguns, library-choice reflexes, and process habits. Auto-grows from a journal of
  review-fix commits via /dev-pipeline:consolidate-lessons.
  USE THIS PROACTIVELY when designing or reviewing ANY of:
  authentication, password reset, OTP, single-use tokens, session invalidation, multi-tenant queries,
  endpoints that must not leak account existence, environment variables, third-party API integrations
  (Resend/Twilio/Stripe/OAuth), security secrets, anything that mutates shared state from >1 entry
  point, anything where two concurrent requests could interleave, branch creation, self-review before
  push, gh CLI usage with secrets, choosing between hand-rolling vs. library functions for parsing/
  validation/dates/URLs, post-merge deploy verification, commit message style.
  Trigger keywords: forgot-password, reset-password, otp, jwt, token, hmac, single-use, consume,
  invalidate, race, cas, compare-and-swap, lua, updateMany, optimistic, lock, tenantId, findFirst,
  enumeration, timing-oracle, env.schema, deploy.yml, third-party API key, gh secret, branch from
  main, self-review, code-reviewer, regex, parseISO, hand-rolled, hand-write a, hex color, URL host.
license: MIT
metadata:
  author: luxebook
  version: "3.0.0"
  scope: |
    Started as production-defensive-patterns (concurrency-cas, enumeration-safety, config-drift,
    silent-no-op-integrations, grep-for-siblings). Renamed to engineering-craft 2026-05-11 to
    cover all engineering lessons, not just defensive patterns. New category groups added:
    workflow, tooling-footguns, library-choice, process.
  source-incidents: PR#85 (5 review rounds, 11 findings), PR#86 (deploy regression), PR#87 (CORS), PR#59 (libraries first), PR#37 (push-back-on-reviews), PR#66 (5 rounds), PR#79 (deferred P2 cascade), PR#31 (broken hook), 2026-05 PDF digest, May 2026 cutover (gh secret), 196-commit fix-history mining (2026-05-12)
  rule-count: 36
  category-count: 14
  last-mined: 2026-05-12
---

# Engineering Craft

Distilled from real engineering work where small lapses cost real time. Every rule here cites a
historical incident SHA so future readers can trace back to evidence, not opinion. The skill grows
itself — every commit matching review-fix patterns is journalled by a hook, and every 2 days
`/dev-pipeline:consolidate-lessons` folds journal entries into refined rules and pushes to the
public mirror.

Rules are organized into TWO macro-groups:

1. **Defensive patterns** — what to do (or not do) when writing code in security-, concurrency-,
   or config-sensitive paths. Pre-merge, before/during code review.
2. **Process & habits** — workflow disciplines (branch from main, self-review, push-back),
   tooling footguns (gh CLI gotchas), library choice reflexes (don't hand-roll), commit/PR style.
   Cross-cutting; applies to every PR.

## When to apply (BLOCKING — read before reviewing or implementing)

| Situation | Mandatory categories to consult |
|-----------|--------------------------------|
| Auth, OTP, password reset, session, JWT | concurrency-cas, enumeration-safety, silent-no-op-integrations |
| Endpoint that must not reveal account existence | enumeration-safety |
| Mutating shared state from >1 entry point | concurrency-cas |
| Adding/changing env var or secret | config-drift, grep-for-siblings, tooling-footguns (gh secret) |
| Integrating third-party API | silent-no-op-integrations, config-drift |
| Multi-tenant query with email/phone/handle | concurrency-cas (fail-closed), enumeration-safety |
| Scheduling / availability / cross-midnight blocks / time formatting | **time-and-timezone (server-local-trap)** |
| Cross-service mutation in tx, store-credit-issue from cancel-flow | **concurrency-cas (cross-tx-cas-recompute, tx-rollback-contract-layers)** |
| Status enum predicate (`status !== 'X'` in business logic) | **concurrency-cas (status-set-creep-on-state-machine-evolution)** |
| Money / Decimal fields touching admin + customer paths | **concurrency-cas (monetary-decimal-symmetry)** |
| Shareable / printable token (QR receipt, magic link) | **concurrency-cas (mint-once-vs-mint-on-demand)** |
| Form submit with `{...formState}` spread, regex tightening on existing field | **grep-for-siblings (payload-shape-drift-against-strict-dto)** |
| Tailwind class change, breakpoint stack, native input restyling | **frontend-design-system-drift (silent-css-class-vacuum)** |
| React effect with server-data dep, A→B→A click sequence, fire-and-forget IIFE | **frontend-async-state (orphan-promise-and-stale-closure)** |
| Tooltip / popover with aria-describedby, viewport-edge clamp | **accessibility-state-sync (aria-lockstep-and-viewport-clamp)** |
| Rename label/role/test-id/copy in code touching E2E | **e2e-test-resilience (selector-coupling-and-blast-radius)** |
| ≥2 review rounds on same PR, deferred-P2 in earlier round | **review-discipline (round-cascade-and-deferred-p2)** |
| Installing third-party middleware (multer/csurf/etc) | **silent-no-op-integrations (middleware-error-mapping)** |
| Starting any new branch | workflow (pull-main-first, branch-naming) |
| Before pushing any branch | workflow (self-review-discipline), checklists/pre-merge-self-review.md |
| Reviewing a Codex/PR-bot finding | workflow (push-back-on-reviews-when-verified) |
| Writing parsing / regex / date math / URL handling | library-choice (libs-first) |
| After merging a PR with auto-deploy | process (post-merge-deploy-verification) |
| Setting a GitHub Secret via CLI | tooling-footguns (gh-secret-set-stdin) |

If you skip this skill while working on the above, you are signing up for a multi-round post-merge
fix cycle. PR#85: 5 review rounds, ~30 hours. PR#59: 4 review rounds. Both avoidable.

## Trigger checklist (gate, not suggestion)

Before declaring "implementation done" on any feature, the implementer MUST be able to point at:

1. ☐ **State machine drawn** for any resource with shared mutable state — see `categories/concurrency-cas/rules/state-machine-first.md`
2. ☐ **Race-test contract** with `expect(fulfilled).toHaveLength(1)` for every shared-state mutation — see `templates/race-test.template.ts`
3. ☐ **Storage-layer atomic gate** (Lua or WHERE predicate, not JS) — see `categories/concurrency-cas/rules/storage-gate-not-js.md`
4. ☐ **Status + timing parity** under success AND failure for any "do not leak" endpoint — see `templates/enumeration-test-suite.template.ts`
5. ☐ **Env consumer audit** (env.schema + deploy.yml + .env.example + runbook + GitHub Secret) — see `categories/config-drift/rules/four-consumer-rule.md` + `categories/tooling-footguns/rules/gh-secret-set-stdin.md`
6. ☐ **Sibling grep** for security-relevant literals removed/changed — see `categories/grep-for-siblings/rules/security-literal-grep.md`
7. ☐ **Integration mode log** (LIVE/DISABLED + `*Required()`) for new third-party wrappers — see `categories/silent-no-op-integrations/rules/configured-state-visible.md`
8. ☐ **Branch from latest main** — see `categories/workflow/rules/pull-main-before-branching.md`
9. ☐ **Self-review with code-reviewer agent** before push — see `categories/workflow/rules/self-review-before-push.md`
10. ☐ **Library exists for what I'm about to hand-roll?** — see `categories/library-choice/rules/libs-first-no-reinventing.md`
11. ☐ **Post-merge deploy watched to success** — see `categories/process/rules/post-merge-deploy-verification.md`

If any box is unchecked, do NOT mark the feature ready for review. Loop back.

## Top-level catalog (read this FIRST for fastest routing)

[INDEX.md](INDEX.md) — Layer A catalog (~80 lines). Stats + by-phase recommendations
+ by-trigger keyword routing. Hit this BEFORE diving into a category README. Borrowed
from Karpathy's LLM Wiki 3-level progressive index pattern (article: "Harness isn't
the goal, knowledge is the moat", 2026-05).

## Categories

### Defensive patterns

| Category | Index | Rule count | When it bites |
|----------|-------|-----------|---------------|
| Concurrency & CAS | [categories/concurrency-cas/README.md](categories/concurrency-cas/README.md) | 6 | Two requests interleave; one silently overwrites the other |
| Enumeration safety | [categories/enumeration-safety/README.md](categories/enumeration-safety/README.md) | 4 | Attacker discovers which emails exist by status/timing diff |
| Config drift | [categories/config-drift/README.md](categories/config-drift/README.md) | 4 | Env added in one consumer, missing in others → boot crash |
| Silent no-op integrations | [categories/silent-no-op-integrations/README.md](categories/silent-no-op-integrations/README.md) | 3 | Third-party wrapper "succeeds" while doing nothing |
| Grep-for-siblings | [categories/grep-for-siblings/README.md](categories/grep-for-siblings/README.md) | 2 | Security literal removed in one file, lingers in two more |

### Process & habits

| Category | Index | Rule count | When it bites |
|----------|-------|-----------|---------------|
| Workflow | [categories/workflow/README.md](categories/workflow/README.md) | 4 | Branched from stale main, skipped self-review, accepted false-positive review feedback |
| Tooling footguns | [categories/tooling-footguns/README.md](categories/tooling-footguns/README.md) | 1 | CLI behavior is different from what the docs imply (gh secret set --body -) |
| Library choice | [categories/library-choice/README.md](categories/library-choice/README.md) | 1 | Hand-rolled regex/parsing for well-studied domains; library default was "almost right" |
| Process | [categories/process/README.md](categories/process/README.md) | 2 | Tests pass + lint clean = floor; post-merge deploy not verified |

### Meta

| Category | Index | Rule count | When it bites |
|----------|-------|-----------|---------------|
| Knowledge management | [categories/knowledge-management/README.md](categories/knowledge-management/README.md) | 1 | When maintaining the skill itself — adding rules, retiring rules, deciding what graduates from project docs |

## Templates (copy-paste ready)

| Template | Purpose | Path |
|----------|---------|------|
| Race test (Promise.allSettled) | Prove exactly-one-fulfilled | [templates/race-test.template.ts](templates/race-test.template.ts) |
| Lua CAS-and-delete | Atomic compare-on-value-then-delete in Redis | [templates/lua-cas-and-delete.template.ts](templates/lua-cas-and-delete.template.ts) |
| Lua CAS-and-increment | Atomic compare-on-value-then-increment with TTL | [templates/lua-cas-and-increment.template.ts](templates/lua-cas-and-increment.template.ts) |
| Postgres optimistic CAS | tokenVersion `updateMany WHERE` predicate | [templates/postgres-optimistic-cas.template.ts](templates/postgres-optimistic-cas.template.ts) |
| Enumeration test suite | Status + timing + outage parity | [templates/enumeration-test-suite.template.ts](templates/enumeration-test-suite.template.ts) |
| Env-deploy parity test | CI test that fails if env added to schema but missing from deploy.yml | [templates/env-deploy-parity.spec.template.ts](templates/env-deploy-parity.spec.template.ts) |
| Integration boot log | LIVE/DISABLED stdout for every third-party wrapper | [templates/integration-boot-log.template.ts](templates/integration-boot-log.template.ts) |

## Checklists

| Checklist | When to run |
|-----------|-------------|
| [Pre-merge self-review](checklists/pre-merge-self-review.md) | Before pushing any branch |
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
| `gh` CLI manual | https://cli.github.com/manual/ |
| date-fns-tz | https://github.com/marnusw/date-fns-tz |
| class-validator | https://github.com/typestack/class-validator |

## How this skill stays alive

- `~/.claude/hooks/post-codex-fix-extract-lesson.sh` (PostToolUse on Bash) appends to
  `~/.claude/lessons-journal/codex-fixes.jsonl` after every commit matching review-fix patterns.
- `launchctl com.luxebook.consolidate-lessons` fires every 2 days, drops a marker file if the
  journal has new entries, raises a macOS notification.
- Session-start hook surfaces the marker so I auto-suggest `/dev-pipeline:consolidate-lessons`.
- `/dev-pipeline:consolidate-lessons` reads journal, fetches diffs via `git show <sha>`, decides
  "new pattern vs refinement," updates rules, archives entries, pushes to public mirror.
- Public mirror at `github.com/orocsy/engineering-craft` (after rename from
  `production-defensive-patterns`).
- Bootstrap a new mirror with: `bash ~/.claude/skills/engineering-craft/scripts/init-public-mirror.sh <github-username>`

## Anti-patterns flagged across all categories

| Anti-pattern | What's wrong | Where it hurts |
|--------------|--------------|---------------|
| "I'll just check the value in JS before writing" | Race window unchanged | concurrency-cas |
| "I'll use SET XX to be safe" | Only protects existence, not value | concurrency-cas |
| "I'll add a per-token gate" | Doesn't help when N tokens lead to ONE write | concurrency-cas |
| "I'll use a transaction" | Isolation alone doesn't add a CAS predicate | concurrency-cas |
| "It's behind a rate limit so the race is impossible" | Rate limits gate request rate, not parallel concurrency | concurrency-cas |
| "I'll let 503 propagate so ops can see Resend is down" | Leaks account existence | enumeration-safety |
| "Email send is fast enough that the timing diff doesn't matter" | 300-2000ms variance is not subtle | enumeration-safety |
| "I'll use findFirst for performance" | Same email across tenants is allowed; pick wrong → hijack | enumeration-safety |
| "I'll add the schema check now and update deploy.yml later" | Deferred consumer updates never happen | config-drift |
| "GitHub Secret already exists, so we're fine" | Secret existence ≠ container env exposure | config-drift |
| "I'll grep for the literal later" | Deferred greps never happen | grep-for-siblings |
| "Tests pass + lint clean = ready to ship" | Race-test contract + state-machine drawing are also gates | pre-merge-self-review |
| "I'll branch from local main; pull's a habit" | Squash-merge invalidates local-history assumptions | workflow |
| "I'll let Codex find the bugs" | Codex is second opinion, not primary; loop is expensive | workflow |
| "I'll just write a regex for hex color / URL host / date parse" | Battle-tested libs handle every edge case | library-choice |
| "Tests passed, deploy will work" | Production has Zod validation + GitHub Secrets the test env doesn't have | process |
| "I'll use --body - to read from stdin (gh secret set)" | Sets the literal string `-` as the value | tooling-footguns |
