---
title: Tag Every Signal With the Tenant — Unconditionally — and Guard Against Untagged Leaks
maturity: proven
impact: HIGH
impact-description: |
  In a multi-tenant system, a telemetry signal (error or analytics event) without the
  tenant id is nearly useless: you can't answer "is tenant X having a bad day?" and you
  can't isolate one tenant's incident from aggregate noise. Worse, if tenant tagging is
  placed inside an unrelated conditional, signals silently ship untagged whenever that
  condition is false — every such error then fingerprints as "no-tenant".
tags: observability, multi-tenant, tagging, fingerprint, sentry, posthog
applies-to: |
  Any multi-tenant service wiring error tracking or product analytics. Every place a
  scope tag, user, group, or event property is set after tenant resolution.
related-rules:
  - pii-scrubbing-defense-in-depth
historical-incidents:
  - a real incident where error-tracker tenant tagging sat inside an `if (ANALYTICS_KEY)` gate; when analytics wasn't configured, errors still fired but fingerprinted as no-tenant
---

## The requirement

Every signal must be queryable per-tenant. Concretely, after tenant resolution in a
request, set the tenant identity on BOTH telemetry surfaces:

```ts
// errors: per-request scope (async-context-aware)
const scope = errorTracker.getCurrentScope();
scope.setUser({ id: userId });          // id only — not email/name (PII)
scope.setTag('tenantId', tenantId);
scope.setTag('tenantSlug', tenantSlug);

// analytics: identify the user + associate with the tenant GROUP
analytics.identify(userId, { /* non-PII traits */ });
analytics.group('tenant', tenantId, { name: tenantSlug });
```

The error tracker's tag enables `tenantId:X` issue filtering. The analytics group
enables tenant-cohort funnels/retention. Both are required; they answer different
questions.

## The conditional-coupling trap (the real failure)

Tenant tagging must live in its OWN unconditional step. The recurring bug: tagging is
folded into a block gated on something unrelated.

```ts
// ❌ Wrong — tenant tagging coupled to analytics being configured
useEffect(() => {
  if (!process.env.NEXT_PUBLIC_ANALYTICS_KEY) return;   // gate is about ANALYTICS
  analytics.init(...);
  errorTracker.setTag('tenantId', tenantId);            // …but error tagging needs only `tenantId`
}, [tenantId]);
// When the analytics key is absent (e.g. preview deploys), errors STILL fire —
// now with no tenantId tag → every such error fingerprints as `no-tenant`.
```

```ts
// ✅ Right — each effect gated by ITS OWN precondition
useEffect(() => {
  if (tenantId) errorTracker.setTag('tenantId', tenantId);   // needs only tenantId
}, [tenantId]);

useEffect(() => {
  if (process.env.NEXT_PUBLIC_ANALYTICS_KEY) analytics.init(...);  // needs the key
}, []);
```

This is a specific case of the general conditional-coupling failure mode (see
cross-file-seams): an effect's gate must match the effect's OWN precondition, not a
neighbor's.

## The cross-tenant guard

Tagging is necessary but not sufficient — add a guard that fails LOUDLY if a signal is
about to leave untagged or if a request's resolved tenant doesn't match the data it's
about to touch:

- **At the telemetry boundary**: in `beforeSend` (errors) / before `capture` (analytics),
  if `tenantId` is missing on a signal that originated inside an authenticated request,
  attach a `MISSING_TENANT_TAG` marker (and in non-prod, throw) so it's visible rather
  than silently grouped as no-tenant.
- **At the data boundary**: assert the request's resolved `tenantId` matches the
  `tenantId` of every row/record the handler loads. A mismatch is a cross-tenant access
  bug — fail closed (see enumeration-safety/multi-tenant-fail-closed).

## Tests

- A request without a resolved tenant does NOT emit an authenticated-path signal that
  lacks a tenant tag (assert the guard fires).
- Tenant tagging fires even when the analytics key is absent (regression test for the
  conditional-coupling trap).
- The analytics group call carries the right group id (mock-completeness: assert the
  arguments, not just that the method was called).

## Anti-patterns

- Tagging tenant inside an `if (analyticsConfigured)` / `if (someOtherFeature)` block.
- Setting `tenantId` on errors but never grouping analytics by tenant (or vice-versa) —
  you lose half the per-tenant questions.
- Putting `email`/`name` in the user object "for convenience" — that's PII; use `id`
  and let the tenant tag + group carry the slicing.
- Trusting that "it's tagged somewhere" without a guard — the one untagged path is the
  one you'll need during an incident.
