# engineering-craft — Layer A Catalog

> The fastest entry point. Read this BEFORE diving into any category README.
> ~120 lines covers the entire knowledge base. Then go to a category README
> for one-line summaries. Then read a rule file only if you need full content.
> Borrowed from Karpathy's LLM Wiki 3-level progressive index.

## Statistics

| Group | Categories | Rules |
|-------|-----------|-------|
| Defensive patterns (backend correctness) | 6 | 34 |
| Verification integrity (checks that aren't checking) | 1 | 4 |
| Observability (errors, analytics, health) | 1 | 3 |
| Frontend patterns | 5 | 7 |
| Process & habits | 5 | 10 |
| Deploy & delivery (CI/CD) | 1 | 13 |
| Other (time, review-discipline) | — | (counted under process) |
| Knowledge management (meta) | 1 | 2 |
| **Total (hand-authored)** | **21** | **74** |
| Generated mirror (`cross-file-seams` ⟳) | 1 | 13 (mirrored from plugin) |

Templates: 15 · Checklists: 5

⟳ = generated, read-only mirror. The `cross-file-seams` category is published from the
dev-pipeline plugin's `cross-file-reasoning` catalog by `/dev-pipeline:consolidate-lessons`;
it is NOT hand-authored here and is excluded from the maturity distribution below.

## Maturity distribution

Hand-authored rules only (after fix-history mining + consolidations through
2026-08-06, incl. the deploy-delivery and verification-integrity categories — every rule
incident-cited): 23 proven · 42 verified · 0 draft.

## Reports

- [2026-08-06 — mining external AI review findings into implementation-time gates](reports/2026-08-06-external-review-mining.md)
  — 1,011 findings across four repos → 18 classes. Headline: **for most classes this catalog
  already held the right rule and it did not fire** — several rules record the very incident
  they later failed to prevent. The ranked class table, the eight executable gates with
  proof they fail on the real defect, and the trigger-scope change all live there.

## Trigger scope — read this before the trigger table

The tables below tell you WHICH rule to load. They have historically failed in two ways,
and both fixes are now part of the doctrine:

1. **Scope is the FAMILY, not the diff.** A rule applies to every surface the change
   *touches or depends on* — including code the diff never edited. The most expensive
   recurring class in the corpus is a control that landed on one path while its structural
   twin shipped without it, and a twin is by definition not in the diff.
2. **Match on SHAPE, not vocabulary, wherever a shape exists.** A trigger row listing
   `consumedAt`/`usedAt` cannot fire on a one-shot transition spelled `pending → active`.
   Where a shape can be enumerated by a machine, prefer the executable gate over the
   keyword row — see [verification-integrity](categories/verification-integrity/README.md)
   and [checklists/impl-time-gates.md](checklists/impl-time-gates.md).

## By-phase recommendations (which categories to load when)

| Pipeline phase | Mandatory categories | Optional categories |
|---------------|---------------------|---------------------|
| **G1 — Requirements** | (none) | workflow (pull-main-before-branching) |
| **G2 — Design** | concurrency-cas (state-machine-first); time-and-timezone (if scheduling) | enumeration-safety (if "do not leak" endpoint) |
| **G3 — Architecture** | concurrency-cas (sibling-resource-invariants, tx-rollback-contract-layers, mint-once-vs-mint-on-demand) | silent-no-op-integrations (if 3rd-party API), library-choice |
| **G4 — Implementation** | [checklists/impl-time-gates.md](checklists/impl-time-gates.md) — run its executable gates; concurrency-cas (storage-gate-not-js, race-test-contract, status-set-creep, monetary-decimal-symmetry, cross-tx-cas-recompute), config-drift (four-consumer-rule, empty-string-vs-undefined), verification-integrity (exhaustive-registry — did you join a family?) | tooling-footguns (gh CLI), frontend-async-state (if React mutations), progressive-degradation (if any `<form>`), accessibility-state-sync (if tooltip/popover) |
| **Pre-push self-review** | **ALL relevant by diff keywords** (see by-trigger table below) **plus every surface the diff DEPENDS ON** + workflow (self-review-before-push) + verification-integrity (have you seen your checks fail?) | review-discipline (round-cascade), grep-for-siblings (if security literal removed), e2e-test-resilience (if rename touches E2E selectors), payload-shape-drift (if DTO/form changed) |
| **Post-merge** | process (post-merge-deploy-verification) | review-discipline (deferred-P2 audit) |

## By-trigger recommendations (which categories to load when keywords appear)

| Trigger keyword in diff or task | Load category first |
|--------------------------------|---------------------|
| **You added a new member to an existing family** — a new `case` in a router, a new route serving an existing data class, a new handler for an existing token class | **verification-integrity/exhaustive-registry-beats-diff-review** (the highest-recurrence class; fires on ADDITION, which every other sibling rule misses) |
| `finalize`, `complete`, `activate`, `settle`, `claim`, `publish`, or ANY `status: A → B` that may happen at most once | **concurrency-cas/single-use-token-consumption** (shape trigger — do not wait for `consumedAt` vocabulary) |
| `verify-*.mjs`, `containsAll(`, `text.includes(` in a check, grep-based scan, snapshot over serialised text | **verification-integrity/probe-must-fail-on-injected-defect** |
| A diff changes ONLY dependency versions in `package.json`/lockfile; or a `fetch`/`XMLHttpRequest` sends values an SDK minted (presigned upload, signed URL, STS token) | **silent-no-op-integrations/forked-sdk-transport** |
| You are about to run `typecheck && test && lint` by hand instead of the project's composed validate/review command | **verification-integrity/run-the-composed-gate-not-your-own** |
| `test.skip(`, `describe.skip`, `xit(`, or a workflow step behind `if: inputs.*` | **verification-integrity/skip-is-a-decision-not-a-default** |
| `as ` applied to `res.json()`, `JSON.parse`, `localStorage.getItem`, a webhook body | **verification-integrity/parse-dont-cast-at-trust-boundaries** |
| `<form` with no `method`, `noscript`, hydration, `client:load`, SSR'd form markup | **progressive-degradation/form-without-method-submits-get** |
| A component with `value` + `onChange` props whose handlers `await` | **frontend-async-state/controlled-input-hides-async-work** |
| You COLLECT a value that must constrain later behaviour — allergy, consent, tenant scope, age gate, quiet hours, entitlement | **grep-for-siblings/collected-constraint-must-reach-every-consumer** (the largest single cluster in the corpus; the dropped value was an allergy) |
| `.github/workflows/deploy*`, `docker compose up`, `docker save`, `workflow_run`, `GHCR`/registry pull, `ssh-action`/`scp-action`, `.dockerignore`, deploy-time `npx` | **deploy-delivery** (+ tooling-footguns for the CLI scars) |
| A job with `environment:` or a deploy step, in a workflow that is a SIBLING of the test workflow rather than its descendant | **deploy-delivery/deploy-must-be-causal-descendant-not-concurrent-sibling** |
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
| Automated-reviewer / PR-bot finding response | workflow/push-back-on-reviews-when-verified |
| ≥2 review rounds on same PR | **review-discipline/round-cascade-and-deferred-p2** |
| `gh workflow run`, post-merge | process/post-merge-deploy-verification |
| `data-testid`, `getByRole`, label rename touching E2E | **e2e-test-resilience/selector-coupling-and-blast-radius** |
| Tailwind class change, breakpoint stack, native input restyling | **frontend-design-system-drift/silent-css-class-vacuum** |
| `useEffect` with server data dep, A→B→A click sequence, fire-and-forget IIFE | **frontend-async-state/orphan-promise-and-stale-closure** |
| `aria-describedby`, tooltip position math | **accessibility-state-sync/aria-lockstep-and-viewport-clamp** |
| Form state spread → API, regex tightening on existing field | **grep-for-siblings/payload-shape-drift-against-strict-dto** |
| `multer`, `body-parser`, third-party middleware | **silent-no-op-integrations/middleware-error-mapping** |
| `Sentry`, `PostHog`, `beforeSend`, telemetry, `setTag`, error tracking, analytics | **observability** (tenant tagging + cross-tenant guard) |
| PII in telemetry, `sendDefaultPii`, scrub, redact, exception message with user data | **observability/pii-scrubbing-defense-in-depth** |
| `identify(`, `reset(`, analytics on logout / shared device, capture inside a tx | **observability/analytics-lifecycle-and-containment** |
| "Sign in with Google", OAuth login, `email_verified`, account linking, SSO | **auth-identity/federated-identity-linking** |
| `.dockerignore`, secrets in image, `docker build` of a monorepo | **tooling-footguns/dockerignore-nested-patterns** |
| `sessionStorage`, `localStorage`, in-app webview (WeChat/Instagram) | **frontend-async-state/web-storage-is-fallible** |
| `basePath`, route file move, `process.env` fallback, SDK option name, `new Observable`/`new Promise` wrapper, mock vs extended class, effect under unrelated `if` | **cross-file-seams** (the 7-trace seam check; mirror of the plugin's `cross-file-reasoning`) |
| `webhook`, webhook dedupe, at-least-once redelivery | **concurrency-cas/webhook-claim-adopt-completedat** |
| payment SDK / `stripe` import (`@stripe/*`, `airwallex`, `adyen`, `braintree`) | **knowledge-management/payment-domain-routing-tripwire** (load the payment-engineering skill's vendor pages FIRST) |
| async completion event, late webhook, job-completion callback | **concurrency-cas/async-event-revalidates-live-pointer** |
| sensitive field, medical, PII intake | **auth-identity/server-rederives-sensitive-classification** |
| terminal event, `cancel` / `expire` of a vendor object | **silent-no-op-integrations/unconsumed-terminal-events** |

## Categories at a glance

### Defensive patterns (backend correctness)

| Category | Rules | One-line |
|----------|-------|----------|
| concurrency-cas | 14 | Read-Modify-Write across network is never atomic; gate must be in storage primitive; tx scope matters; cross-tx recompute is mandatory; mint-once tokens never re-mint; status predicates use allow-lists |
| enumeration-safety | 4 | Two responses on a sensitive condition must be indistinguishable on every observable channel |
| config-drift | 5 | Every env var has 5+ consumers; same-commit rule; GH Actions emits "" not undefined; tighten validators with migration audits |
| silent-no-op-integrations | 5 | Third-party wrapper that silently no-ops on missing API key is the worst failure mode; map middleware errors to HTTP status |
| grep-for-siblings | 4 | Security-relevant literal removal triggers repo-wide grep; payload shapes drift against strict DTO; a collected constraint must be threaded to every decision that must honour it |
| auth-identity | 2 | Unauthenticated OAuth may only sign in an already-linked subject; email_verified ≠ mailbox ownership; first-time linking requires an authenticated session |
| cross-file-seams ⟳ | 13 | **Generated mirror** of the dev-pipeline plugin's `cross-file-reasoning` catalog — the seam check (env fallback, route prefix, SDK option, event tx semantics, mock drift, conditional coupling, wrapper lifecycle, claimed-but-unlanded fix, untested side effect, workspace build context). Canonical source is the plugin; do not hand-edit. |

### Verification integrity (a green signal that is not checking)

| Category | Rules | One-line |
|----------|-------|----------|
| verification-integrity | 4 | A signal is worth only what it costs to make it lie: probes must be proven to fail on a DECOY defect; skips are dated decisions, never defaults; `as T` on remote data is a false green from the compiler; and the family must be enumerated in code, because a rule scoped to the diff cannot see the twin the diff joined |

### Observability

| Category | Rules | One-line |
|----------|-------|----------|
| observability | 3 | Three pillars (errors/analytics/health), every signal sliceable per-tenant; PII scrubbing is defense-in-depth; tag tenant unconditionally + guard untagged leaks; identify/reset lifecycle + contained captures |

### Frontend patterns

| Category | Rules | One-line |
|----------|-------|----------|
| e2e-test-resilience | 1 | E2E selectors over-couple to rendered shape; treat renames as repo-wide grep through specs + i18n + lanes |
| frontend-design-system-drift | 1 | Tailwind silently renders zero CSS for unknown classes; native input restyling drops behaviors; typed token maps + breakpoint bases |
| frontend-async-state | 3 | Orphan promises, stale closures (A→B→A), latched init effects, step-transition slot reacquisition; Web Storage access is fallible in webviews; a `value`/`onChange` contract cannot express "in flight", so an async child must lift a busy channel or the parent's Save commits a partial value |
| accessibility-state-sync | 1 | ARIA-describedby in lockstep with parent visibility; clamp tooltip both edges using documentElement.clientWidth |
| progressive-degradation | 1 | Name the state your surface is in when the script has not run, and DECLARE it — a `<form>` with no `method` natively submits GET, putting every field in the URL, history, `Referer` and access logs |

### Deploy & delivery (CI/CD)

| Category | Rules | One-line |
|----------|-------|----------|
| deploy-delivery | 13 | A deploy pipeline is production code — and the deploy job must be a CAUSAL DESCENDANT of the job that runs the tests, never a sibling triggered by the same event: runner-brokered image transport (no registry PATs); deploys touch only owned services (compose config-hash recreation); env-write guarded against empty secrets; never cancel-in-progress; on-box AND public gates; workflow_run chain edges incl. paths coverage; `**/.env` out of images; explicit tagged-image prune; pinned CLIs; first-run watch-items + fix-through-the-pipeline. Born from LuxeBook scars + CoachFlow's chain-arming (2026-08-01). |

### Process & habits

| Category | Rules | One-line |
|----------|-------|----------|
| workflow | 4 | Branch from latest main; self-review with code-reviewer agent before push; push back on reviews after evidence |
| tooling-footguns | 2 | CLI/config behavior may differ from intuition (gh secret set --body - sets the literal "-"; .dockerignore bare patterns match context root only) |
| library-choice | 1 | Don't hand-roll regex/parser/date/URL — battle-tested libs handle every edge case |
| process | 2 | "Tests pass" ≠ "deploy succeeded"; watch deploy after every merge; build-validate before commit |
| review-discipline | 1 | Automated-review rounds cascade; treat deferred P2 as scheduled; self-review BEFORE the automated reviewer; explicit careful flow review post-E2E green |
| time-and-timezone | 1 | Every Date/parseISO without explicit TZ uses host TZ; pre-format strings backend-side; add a TZ=Asia/Hong_Kong test project |

### Meta

| Category | Rules | One-line |
|----------|-------|----------|
| knowledge-management | 2 | How the skill itself is structured, matured, decayed, and lint'd. Read once, apply forever. |

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
