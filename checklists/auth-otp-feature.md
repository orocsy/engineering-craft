# Auth / OTP / Password-Reset Feature Checklist

Run this BEFORE writing code for any credential flow: login, signup, password reset,
OTP, magic links, 2FA enrollment, session invalidation.

This is the densest concentration of defensive patterns in the project. Every
sub-section here corresponds to a real PR#85 finding.

## Step 0 — design phase (before any code)

- [ ] Threat model written: what does an attacker gain from breaking this flow?
      (account takeover? denial of service? enumeration?)
- [ ] State machine drawn for any shared mutable state (OTP key, single-use token,
      session row) — see [state-machine-first.md](../categories/concurrency-cas/rules/state-machine-first.md)
- [ ] Concurrent-transition matrix enumerated: every PAIR of transitions explicitly
      decided (mutually exclude / both can succeed / one must lose)
- [ ] External prerequisites identified BEFORE design closes: Resend account, domain
      DKIM, SMS provider, OAuth callbacks. List as "external prereqs" at G1.

## Concurrency (every CAS site identified before code)

- [ ] Every "consume once" path uses storage-layer CAS (`updateMany WHERE flag=null`
      or Lua compare-and-X)
- [ ] User-row write CAS via `tokenVersion` predicate (any path that updates
      `User.passwordHash` does this)
- [ ] Sibling-resource invariant: consuming one credential revokes ALL outstanding
      credentials for the same effect (link + OTP)
- [ ] Race tests written for every transition pair from the matrix —
      `Promise.allSettled` + `expect(fulfilled).toHaveLength(1)`

## Enumeration safety (every endpoint contract verified)

- [ ] Forgot-password / OTP-request endpoint contract: "always 204 / always 200"
- [ ] Controller swallows ALL errors (not just `ServiceUnavailableException`) to
      preserve the status-code oracle
- [ ] Equalizer (`equalizeBcryptTiming`) called on EVERY early-return branch
- [ ] Multi-tenant lookup uses `findMany` + fail-closed if `length !== 1` (no `findFirst`)
- [ ] Email send is fire-and-forget (`void send().catch(logSwallow)`) so timing is parity-safe
- [ ] Status + timing parity tests written (status under success + status under outage
      + timing under both)

## Session invalidation

- [ ] Successful credential consumption increments `tokenVersion` (the JWT verify path
      compares against current `tokenVersion` and rejects mismatched JWTs)
- [ ] Tests: after password reset, prior session JWT is rejected on the next request

## Single-use semantics

- [ ] Every credential type (link, OTP, magic, invite) has a "consumed" flag (or
      Redis key absence) AND the consume path uses storage-layer CAS
- [ ] Replay tests: consuming a credential twice in sequence throws GoneException
      (sequential test) AND in parallel throws GoneException once (race test)

## Crypto hygiene

- [ ] OTP code is HMAC-hashed at storage (never plaintext)
- [ ] HMAC key is from env (`CUSTOMER_CONTACT_HASH_SECRET`), not hardcoded fallback
      — see [security-literal-grep.md](../categories/grep-for-siblings/rules/security-literal-grep.md)
- [ ] HMAC key length validated (≥16 chars) at env schema
- [ ] bcrypt rounds match production-equivalent (10-12)
- [ ] OTP comparison uses constant-time (`bcrypt.compare`, not `===`)
- [ ] JWT signing key is from env (`JWT_SECRET`), not hardcoded
- [ ] JWT verify rejects tokens whose `tokenVersion` doesn't match current user row

## Email / SMS integration

- [ ] Wrapper has LIVE/DISABLED boot log (see [new-third-party-integration.md](new-third-party-integration.md))
- [ ] Wrapper exposes `*Required()` variant for password-reset call sites
- [ ] Env schema hard-fails in production if API key is missing
- [ ] Fire-and-forget the send call to preserve timing parity
- [ ] Failures logged structured (severity, hashed identifier — never raw email)

## Multi-tenancy

- [ ] Every Prisma query filters by `tenantId` where applicable (or fail-closed when
      identifier could match multiple tenants)
- [ ] Cross-tenant isolation test: cannot reset a Tenant A account using a Tenant B
      credential (link, OTP, JWT)
- [ ] Sibling-revocation is tenant-scoped (don't accidentally revoke another tenant's
      tokens)

## Config / deploy

- [ ] Every new env var goes through [new-env-var.md](new-env-var.md) checklist
- [ ] `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `JWT_SECRET`, `ADMIN_APP_URL`,
      `CUSTOMER_CONTACT_HASH_SECRET` all production-required + in deploy.yml + GitHub
      Secret set
- [ ] env-schema/deploy.yml parity test passes

## Tests required

In addition to the standard unit/integration/E2E suite:

- [ ] Race tests (Flavor 1 with real DB or Flavor 2 with mock interleaving) for
      every shared-state mutation
- [ ] Status + timing parity tests for every "do not leak" endpoint
- [ ] Replay tests for every single-use credential
- [ ] Multi-tenant collision tests (same email, two tenants, ambiguous reset)
- [ ] Outage tests (Resend 503 → still 204; DB unreachable → still 204)
- [ ] Sibling-revocation tests (consuming one link revokes others; OTP reset revokes
      outstanding link)
- [ ] Cross-method test (concurrent link + OTP → exactly one wins, password is one
      of the two values)

## Pre-push gate (don't skip)

- [ ] Run [pre-merge-self-review.md](pre-merge-self-review.md) — entire checklist
- [ ] Self-review the diff with the code-reviewer agent
- [ ] Manually run the user-facing flow in dev (clicked link, typed OTP, set
      password, verified login works after reset)

## After push

- [ ] CI green
- [ ] After merge: monitor `gh run watch` on the deploy workflow
- [ ] Verify `/health` reports all integrations LIVE
- [ ] Manually run the flow against prod once

## References

- [concurrency-cas/README.md](../categories/concurrency-cas/README.md)
- [enumeration-safety/README.md](../categories/enumeration-safety/README.md)
- [silent-no-op-integrations/README.md](../categories/silent-no-op-integrations/README.md)
- [config-drift/README.md](../categories/config-drift/README.md)
- [grep-for-siblings/README.md](../categories/grep-for-siblings/README.md)
- Real example: [docs/owner-password-reset/case-study.md](file:///Users/SeanCai/Desktop/projects/luxebook/docs/owner-password-reset/case-study.md)
