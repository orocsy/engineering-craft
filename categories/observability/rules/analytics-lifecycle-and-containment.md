---
title: Analytics Identity Lifecycle + Containment — reset on logout, wait for auth to settle, never break the business path
maturity: verified
impact: HIGH
impact-description: |
  Three real incidents from one observability rollout: (1) missing reset() on
  logout tagged the next login's events to the PREVIOUS user's cookied
  distinctId on shared workstations; (2) reset() firing during the auth
  provider's loading window split every hard refresh into two distinct
  analytics sessions; (3) an analytics capture throwing inside a serializable
  transaction rolled back the BUSINESS operation because of a telemetry guard.
tags: observability, analytics, identify, reset, lifecycle, containment, posthog
applies-to: |
  Any app wiring a product-analytics SDK with an identify/reset lifecycle
  (PostHog, Amplitude, Mixpanel…), especially with shared-device users or
  server-side capture inside transactions.
related-rules:
  - pii-scrubbing-defense-in-depth
  - tenant-tagging-and-cross-tenant-guard
historical-incidents:
  - a real incident: missing reset-on-logout attributed the next user's events to the prior user's distinctId on shared front-desk workstations
  - a real incident: reset() fired during the auth /me loading window (loading=true, user=null), splitting sessions across every hard refresh
  - a real incident: a dev-mode analytics guard threw inside emitAsync and rolled back the booking transaction
---

## Lesson 1 — reset() on logout is part of the identify lifecycle

`identify(userId)` without a paired `reset()` on logout means the NEXT user on a
shared device inherits the previous user's cookied distinctId until their own
identify lands — early events are attributed to the wrong person. Shared
workstations (front desk, kiosk, clinic counter) make this a daily occurrence,
not an edge case.

```ts
useEffect(() => {
  if (loading) return;              // see Lesson 2
  if (user) analytics.identify(user.id, safeTraits(user));
  else analytics.reset();           // logout / session expiry
}, [user, loading]);
```

## Lesson 2 — gate identify/reset on auth state having SETTLED

Auth providers typically expose `{ user, loading }` where `user` is null WHILE
`loading` is true. An effect keyed only on `[user]` fires `reset()` during that
loading window on every hard refresh — pre-refresh and post-refresh activity
land under different distinctIds, and the first frames after refresh emit
anonymously. The same race clears error-tracker tags in sibling effects.

Gate every identify/reset (and error-tracker tag/untag) effect on
`loading === false`. Deps: `[user, loading]`.

## Lesson 3 — telemetry must NEVER break the business path

A capture call that can throw (SDK misconfigured, a dev-mode guard tripping,
network client exploding) must be contained at the call site. If the capture
runs inside a transaction (event listener with sync-in-tx semantics), an
uncontained throw rolls back the BUSINESS operation — a booking fails because
analytics hiccuped, strictly worse than losing one event.

```ts
private safeCapture(event: string, props: Props) {
  try { this.analytics.capture(event, props); }
  catch (err) { this.logger.warn(`analytics capture failed: ${err}`); }
}
```

Every capture site goes through the wrapper. The inverse trade-off (losing an
event silently) is acceptable; log it and move on.

## Tests

- Logout transition: user → null (with loading=false) asserts `reset()` called.
- Loading window: `{loading: true, user: null}` asserts NEITHER identify NOR
  reset fires; only after `loading: false`.
- Containment: capture mock throws → the surrounding business operation still
  commits; a warning is logged.

## Anti-patterns

- identify without reset ("logout is rare") — shared devices make it routine.
- Effect deps `[user]` alone when the provider exposes a loading flag.
- Raw `analytics.capture(...)` inside transaction-scoped listeners.
- Catching the throw but rethrowing after logging — containment means CONTAIN.
