# Pre-Merge Self-Review Checklist

Run this BEFORE `git push` on any branch that touches:
- Authentication (login, password reset, OTP, JWT, sessions)
- Endpoints with "do not leak existence" contracts
- Multi-tenant queries on user identifiers (email, phone, handle)
- Environment variables / secrets / config
- Third-party API integrations
- Anything that mutates shared state from >1 entry point

Skipping this checklist when working in any of the above is the structural reason
PR#85 needed 5 review rounds. Treat it as a hard gate.

## How to use

For each section that applies to your branch, check every box. If a box can't be
checked, the implementation is not ready — loop back. Do NOT mark a feature ready
for review with unchecked boxes.

## State machine + race tests (concurrency-cas)

For ANY feature that mutates shared state:

- [ ] State machine drawn (markdown table or .excalidraw) — every state, every
      transition, every concurrent transition pair enumerated
- [ ] For each "concurrent transition pair → mutually exclude" entry: a `Promise.allSettled`
      race test exists with `expect(fulfilled).toHaveLength(1)`
- [ ] Storage-layer atomic gate verified: every "consume once" or "CAS on value"
      operation has the gate IN the storage primitive (Lua / `WHERE` predicate),
      not in JS
- [ ] Every entry-point that leads to a shared-row write has the CAS predicate at
      the WRITE layer (not just the entry-point gate) — see `tokenVersion` pattern
- [ ] Sibling-resource invariant: if multiple credentials grant the same effect,
      consuming one revokes the others in the same transaction

References:
- [state-machine-first.md](../categories/concurrency-cas/rules/state-machine-first.md)
- [storage-gate-not-js.md](../categories/concurrency-cas/rules/storage-gate-not-js.md)
- [race-test-contract.md](../categories/concurrency-cas/rules/race-test-contract.md)

## Enumeration safety (any "do not leak existence" endpoint)

- [ ] Same status code returned for known + unknown identifier under SUCCESS
- [ ] Same status code returned for known + unknown identifier when downstream is
      DOWN (Resend 503, DB unreachable, etc.) — i.e., controller swallows ALL errors
- [ ] Same wall-clock envelope: timing-equalizer (`equalizeBcryptTiming`) called on
      EVERY early-return branch (not-found, inactive, ambiguous, error-swallowed)
- [ ] Multi-tenant lookup uses `findMany` + fail-closed if `length !== 1` (no `findFirst`)
- [ ] Test suite includes the 3 status-parity tests, the 2 timing-parity tests, and
      the behavioral-diff test (verifying the side effect IS asymmetric — only the
      "exists" branch sends the email)

References:
- [enumeration-safety/README.md](../categories/enumeration-safety/README.md)
- [enumeration-test-suite.template.ts](../templates/enumeration-test-suite.template.ts)

## Config drift (any env var added/changed)

- [ ] `apps/api/src/config/env.schema.ts` — entry added with correct optionality
- [ ] If production-required: `superRefine` block with descriptive error message
- [ ] `.github/workflows/deploy.yml` — `-e VAR="${{ secrets.VAR }}"` line added
- [ ] `.env.example` — placeholder added (if file exists)
- [ ] Runbook / README / docs — value documented; format matches what the validator
      accepts
- [ ] Test fixtures (`buildValidEnv`, `buildDisabledBillingEnv`, `jest-setup.ts`) updated
- [ ] If `NEXT_PUBLIC_*` or frontend reads it: Vercel project env vars updated +
      `vercel.json` if applicable
- [ ] **GitHub Secret exists**: `gh secret list -R owner/repo | grep VAR_NAME`
- [ ] env-schema/deploy.yml parity test updated (regenerates from new schema state)

References:
- [config-drift/README.md](../categories/config-drift/README.md)
- [new-env-var.md](new-env-var.md)

## Silent no-op integrations (any third-party API wrapper)

- [ ] Wrapper has `onModuleInit` that prints structured `{ integration, mode: LIVE | DISABLED }`
      log
- [ ] Wrapper exposes BOTH `doStuff` (best-effort) AND `doStuffRequired` (throws)
- [ ] Security-critical call sites use `doStuffRequired` (audit with grep)
- [ ] Tests cover BOTH branches: LIVE-success, LIVE-error, DISABLED-best-effort, DISABLED-required
- [ ] Env schema hard-fails in production if the integration's API key is missing

References:
- [silent-no-op-integrations/README.md](../categories/silent-no-op-integrations/README.md)
- [new-third-party-integration.md](new-third-party-integration.md)

## Grep-for-siblings (any security-relevant literal removed/changed)

- [ ] Removed a security literal? grepped repo for the same family of literals
      (`'dev-secret-change-in-production'`, `'change-in-production'`, etc.)
- [ ] Renamed a function/type/env var? ran the 7 grep families (direct, type,
      string-literal, dynamic-import, re-export, test-mock, doc)
- [ ] Removed a `process.env.X || 'default'` fallback? wired the new requirement
      through env.schema + deploy.yml + docs (see config-drift checklist)

References:
- [grep-for-siblings/README.md](../categories/grep-for-siblings/README.md)

## Behavioral verification (the "tests pass + lint clean" floor is not enough)

- [ ] Lint clean
- [ ] TypeScript clean
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass (browser, headed)
- [ ] **Race tests pass** (the one that proves `expect(fulfilled).toHaveLength(1)`)
- [ ] **Enumeration parity tests pass** (status + timing + outage)
- [ ] **Env-schema/deploy.yml parity test passes**
- [ ] Manual smoke: ran the actual user-facing flow in dev (clicked the link, typed
      the OTP, etc.)

## Self-reviewer agent

Last step before push:

```
Agent({
  description: "Independent code review on current diff",
  subagent_type: "code-reviewer",
  prompt: "Review the diff at `git diff main...HEAD` independently. I'm shipping
           <feature> and have already passed the production-defensive-patterns
           checklist. Look for: race conditions across endpoints, enumeration
           leaks, config drift, silent no-op integrations, sibling-resource
           invariants. Report any concerns; if clean, say so explicitly."
})
```

Receive findings. If any are real, loop back. Do NOT push with open findings.

## After push

- [ ] CI green on the PR
- [ ] If on a branch that auto-deploys after merge: monitor `gh run watch` after merge
      and verify the deploy succeeded (do NOT walk away assuming "tests passed = deploy
      will succeed")
- [ ] If a new GitHub Secret is required: verify `gh secret list -R owner/repo`
      shows it BEFORE the deploy fires

## Why this is a one-pass gate, not a "fix it in review" loop

Codex (and human reviewers) are second opinions, not primary correctness gates. If
this checklist is treated as optional, the review loop becomes the gate — and the
review loop is high-latency, expensive in tokens, and frustrating in UX. PR#85 spent
30+ hours in 5 review rounds because this checklist didn't exist.

The one-pass quality bar is: implementer runs this checklist BEFORE push. Reviewers
catch the things the implementer missed despite the checklist (rare). Codex catches
what reviewers missed (rarer). Three layers, each one a small additional filter — not
a single high-latency review serving as the only filter.
