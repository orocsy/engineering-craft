# Observability (errors, analytics, health — for multi-tenant SaaS)

**When this category bites**: production is on fire and you can't answer "is tenant X
having a bad day?" in 30 seconds; or customer PII has been silently shipping to a
telemetry vendor for months; or every error fingerprints as `no-tenant` because tagging
was gated behind an unrelated condition.

**Source incidents**: a multi-tenant SaaS observability buildout; a cross-file review
that caught PII leaking through un-scrubbed telemetry surfaces.

## The bedrock requirement

"We have logs somewhere" is not observability. The minimum for a multi-tenant SaaS to
operate without flying blind is **three pillars, every one sliceable per-tenant**:

1. **Errors** — when something throws, you find out, with stack trace + request + user +
   **tenant** context. (Sentry, Rollbar, Bugsnag, …)
2. **Product analytics** — what users actually do: funnels, retention, feature usage,
   tenant cohorts. (PostHog, Amplitude, Mixpanel, …)
3. **Health probes** — a yes/no endpoint for load balancers / orchestrators:
   `/health/live` (process alive, even if degraded) and `/health/ready` (can serve —
   DB up, cache up). Plus an external **uptime check** so you learn you're down even when
   your own monitoring is down.

**Tenant slicing is the cross-cutting requirement**: every signal above MUST carry the
tenant identity, or you can't isolate a single tenant's incident from aggregate noise.

## Rules in this category

| Rule | One-line |
|------|----------|
| [pii-scrubbing-defense-in-depth](rules/pii-scrubbing-defense-in-depth.md) | An SDK "don't send PII" flag only covers what the SDK auto-collects; application-controlled values (exception messages, breadcrumbs, contexts) need an explicit KEY+VALUE scrubber that walks every event surface, returns a new object, and is shared across runtimes. |
| [tenant-tagging-and-cross-tenant-guard](rules/tenant-tagging-and-cross-tenant-guard.md) | Tag every error + analytics event with the tenant id in its own unconditional step (never behind an unrelated gate); add a guard that fails loudly if a signal is about to leave untagged. |
| [analytics-lifecycle-and-containment](rules/analytics-lifecycle-and-containment.md) | reset() on logout is part of the identify lifecycle (shared devices); gate identify/reset on auth-loading settled; contain every capture so telemetry can never roll back a business transaction. |

## Vendor-neutral note

The rules name specific tools (Sentry, PostHog) as the concrete examples they were
learned on, but the patterns are vendor-neutral: any error tracker has a "last chance
before send" hook (Sentry `beforeSend`, Rollbar `transform`, Bugsnag `onError`); any
analytics tool has an identify/group lifecycle. Read the pattern, map it to your vendor.

## Free-tier reality

Errors (Sentry), analytics (PostHog), and health/uptime can run at $0/mo through a
meaningful scale on free tiers — observability is not a "later, when we can afford it"
concern. Wire it from the start; retrofitting tenant context after the fact is far more
expensive than adding it up front.
