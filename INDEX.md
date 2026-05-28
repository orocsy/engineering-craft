# engineering-craft — Layer A Catalog

> The fastest entry point. Read this BEFORE diving into any category README.
> ~120 lines covers the entire knowledge base. Then go to a category README
> for one-line summaries. Then read a rule file only if you need full content.
> Borrowed from Karpathy's LLM Wiki 3-level progressive index.

## Statistics

| Group | Categories | Rules |
|-------|-----------|-------|
| Defensive patterns (backend correctness) | 5 | 27 |
| Frontend patterns | 4 | 4 |
| Process & habits | 5 | 9 |
| Other (time, review-discipline) | — | (counted under process) |
| Knowledge management (meta) | 1 | 1 |
| **Total (hand-authored)** | **15** | **43** |
| Generated mirror (`cross-file-seams` ⟳) | 1 | 10 (mirrored from plugin) |

Templates: 7 · Checklists: 4

⟳ = generated, read-only mirror. The `cross-file-seams` category is published from the
dev-pipeline plugin's `cross-file-reasoning` catalog by `/dev-pipeline:consolidate-lessons`;
it is NOT hand-authored here and is excluded from the maturity distribution below.

## Maturity distribution

After 2026-05-12 backfill + fix-history mining + first consolidation (hand-authored rules only):
17 proven · 26 verified · 0 draft.

## By-phase recommendations (which categories to load when)

| Pipeline phase | Mandatory categories | Optional categories |
|---------------|---------------------|---------------------|
| **G1 — Requirements** | (none) | workflow (pull-main-before-branching) |
| **G2 — Design** | concurrency-cas (state-machine-first); time-and-timezone (if scheduling) | enumeration-safety (if "do not leak" endpoint) |
| **G3 — Architecture** | concurrency-cas (sibling-resource-invariants, tx-rollback-contract-layers, mint-once-vs-mint-on-demand) | silent-no-op-integrations (if 3rd-party API), library-choice |
| **G4 — Implementation** | concurrency-cas (storage-gate-not-js, race-test-contract, status-set-creep, monetary-decimal-symmetry, cross-tx-cas-recompute), config-drift (four-consumer-rule, empty-string-vs-undefined) | tooling-footguns (gh CLI), frontend-async-state (if React mutations), accessibility-state-sync (if tooltip/popover) |
| **Pre-push self-review** | **ALL relevant by diff keywords** (see by-trigger table below) + workflow (self-review-before-push) | review-discipline (round-cascade), grep-for-siblings (if security literal removed), e2e-test-resilience (if rename touches E2E selectors), payload-shape-drift (if DTO/form changed) |
| **Post-merge** | process (post-merge-deploy-verification) | review-discipline (deferred-P2 audit) |

## By-trigger recommendations (which categories to load when keywords appear)

| Trigger keyword in diff or task | Load category first |
|--------------------------------|---------------------|
| `forgot-password`, `reset-password`, `otp`, `jwt`, `session`, `tokenVersion` | concurrency-cas + enumeration-safety + auth-otp checklist |
| `findFirst`, `email` lookup, multi-tenant | enumeration-safety/multi-tenant-fail-closed |
| `env.schema`, `deploy.yml`, `secrets.X`, `gh secret set` | config-drift + tooling-footguns |
| `Resend`, `Twilio`, `Stripe`, `S3`, `OAuth` (any third-party API) | silent-no-op-integrations |
| `dev-secret-change-in-production` removal, security literal change | grep-for-siblings/security-literal-grep |
| `regex`, `parseISO`, `new RegExp`, hand-rolled parser | library-choice/libs-first-no-reinventing |
| `parseISO`, `startOfDay`, `getHours`, `Date#`, scheduling | **time-and-timezone/server-local-trap** |
| `tx.commit`, `executeInSerializableTransaction`, multi-service mutation | **concurrency-cas/cross-tx-cas-recompute** + tx-rollback-contract-layers |
| `status !== 'X'`, status enum predicates | **concurrency-cas/status-set-creep-on-state-machine-evolution** |
| `Decimal`, `as unknown as number`, money fields | **concurrency-cas/monetary-decimal-symmetry** |
| `qrToken`, `magic link`, printable receipt | **concurrency-cas/mint-once-vs-mint-on-demand** |
| `git checkout -b`, branch creation | workflow/pull-main-before-branching |
| Pre-push git operations | workflow/self-review-before-push |
| Codex / PR-bot finding response | workflow/push-back-on-reviews-when-verified |
| ≥2 review rounds on same PR | **review-discipline/round-cascade-and-deferred-p2** |
| `gh workflow run`, post-merge | process/post-merge-deploy-verification |
| `data-testid`, `getByRole`, label rename touching E2E | **e2e-test-resilience/selector-coupling-and-blast-radius** |
| Tailwind class change, breakpoint stack, native input restyling | **frontend-design-system-drift/silent-css-class-vacuum** |
| `useEffect` with server data dep, A→B→A click sequence, fire-and-forget IIFE | **frontend-async-state/orphan-promise-and-stale-closure** |
| `aria-describedby`, tooltip position math | **accessibility-state-sync/aria-lockstep-and-viewport-clamp** |
| Form state spread → API, regex tightening on existing field | **grep-for-siblings/payload-shape-drift-against-strict-dto** |
| `multer`, `body-parser`, third-party middleware | **silent-no-op-integrations/middleware-error-mapping** |
| `basePath`, route file move, `process.env` fallback, SDK option name, `new Observable`/`new Promise` wrapper, mock vs extended class, effect under unrelated `if` | **cross-file-seams** (the 7-trace seam check; mirror of the plugin's `cross-file-reasoning`) |

## Categories at a glance

### Defensive patterns (backend correctness)

| Category | Rules | One-line |
|----------|-------|----------|
| concurrency-cas | 12 | Read-Modify-Write across network is never atomic; gate must be in storage primitive; tx scope matters; cross-tx recompute is mandatory; mint-once tokens never re-mint; status predicates use allow-lists |
| enumeration-safety | 4 | Two responses on a sensitive condition must be indistinguishable on every observable channel |
| config-drift | 5 | Every env var has 5+ consumers; same-commit rule; GH Actions emits "" not undefined; tighten validators with migration audits |
| silent-no-op-integrations | 4 | Third-party wrapper that silently no-ops on missing API key is the worst failure mode; map middleware errors to HTTP status |
| grep-for-siblings | 3 | Security-relevant literal removal triggers repo-wide grep; payload shapes drift against strict DTO |
| cross-file-seams ⟳ | 10 | **Generated mirror** of the dev-pipeline plugin's `cross-file-reasoning` catalog — the 7-trace seam check (env fallback, route prefix, SDK option, event tx semantics, mock drift, conditional coupling, wrapper lifecycle). Canonical source is the plugin; do not hand-edit. |

### Frontend patterns

| Category | Rules | One-line |
|----------|-------|----------|
| e2e-test-resilience | 1 | E2E selectors over-couple to rendered shape; treat renames as repo-wide grep through specs + i18n + lanes |
| frontend-design-system-drift | 1 | Tailwind silently renders zero CSS for unknown classes; native input restyling drops behaviors; typed token maps + breakpoint bases |
| frontend-async-state | 1 | Orphan promises, stale closures (A→B→A), latched init effects (user-input vs server-derived), step-transition slot reacquisition |
| accessibility-state-sync | 1 | ARIA-describedby in lockstep with parent visibility; clamp tooltip both edges using documentElement.clientWidth |

### Process & habits

| Category | Rules | One-line |
|----------|-------|----------|
| workflow | 4 | Branch from latest main; self-review with code-reviewer agent before push; push back on reviews after evidence |
| tooling-footguns | 1 | CLI behavior may differ from docs (gh secret set --body - sets the literal "-") |
| library-choice | 1 | Don't hand-roll regex/parser/date/URL — battle-tested libs handle every edge case |
| process | 2 | "Tests pass" ≠ "deploy succeeded"; watch deploy after every merge; build-validate before commit |
| review-discipline | 1 | Codex rounds cascade; treat deferred P2 as scheduled; self-review BEFORE Codex; explicit careful flow review post-E2E green |
| time-and-timezone | 1 | Every Date/parseISO without explicit TZ uses host TZ; pre-format strings backend-side; add a TZ=Asia/Hong_Kong test project |

### Meta

| Category | Rules | One-line |
|----------|-------|----------|
| knowledge-management | 1 | How the skill itself is structured, matured, decayed, and lint'd. Read once, apply forever. |

## Maturity legend

Each rule's frontmatter declares one of:
- **proven** — backed by ≥2 historical incidents across ≥2 projects (or 2+ PR rounds in same project). High confidence; load eagerly when triggered.
- **verified** — backed by 1 historical incident, validated by ≥1 successful application since. Load when triggered.
- **draft** — observed once, no validation yet. Load only when explicit signal matches; expect refinement as more incidents arrive.

## Decay legend

Decay applies when a rule isn't referenced in `knowledgeReferences` for the timeout period:

| Current maturity | Decay trigger | New maturity |
|------------------|---------------|--------------|
| proven | 12 months unreferenced | verified |
| verified | 6 months unreferenced | draft |
| draft | persistent unreferenced + Lint flag | archived (moved out of active index) |

Run `/dev-pipeline:consolidate-lessons` (every 2 days via launchd reminder) to apply decay.

## How to read this skill

1. **Always start here** (`INDEX.md`) — figure out which category matches your work.
2. **Read the category `README.md`** — get one-line summaries of every rule.
3. **Read individual rule files only when** the one-liner doesn't tell you what you need.

This 3-level progression is the difference between "load 36 rules into context (~50K tokens)" and "load 1 INDEX + 1 category README + 1-2 rule files (~4K tokens)" — 12x context efficiency.
