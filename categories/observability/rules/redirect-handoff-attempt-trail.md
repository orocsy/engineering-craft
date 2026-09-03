---
title: Instrument the Redirect Handoff Before You Tune Its Parameters
last-referenced: 2026-09-02
maturity: proven
type: guideline
impact: HIGH
impact-description: |
  An OAuth integration looped between the vendor's authorize endpoint and its login page.
  Four parameter experiments were run over three weeks — each one a fresh merchant test,
  a fresh wait, and a guess — because nothing recorded whether the vendor had EVER
  redirected back to our callback. That single fact decides whether the bug is yours or
  theirs, and it was unrecoverable: the state row was swept by the next attempt, so each
  failed test erased its own evidence.
tags: oauth, redirect, callback, observability, attempt-trail, third-party, diagnosis
applies-to: |
  Any flow where control leaves your system, a third party acts, and control may or may
  not come back: OAuth/SSO authorization, hosted checkout, payment 3DS, e-signature,
  webhook-confirmed handoffs, bank redirect flows.
related-rules:
  - third-party-endpoint-control-probe
  - configured-state-visible
  - analytics-lifecycle-and-containment
  - pii-scrubbing-defense-in-depth
historical-incidents:
  - Alibaba.com ICBU OAuth, 2026-08/09. `startOAuth()` swept expired state rows BEFORE
    minting a new one, so clicking Connect a second time deleted the only record of the
    first failure. After each failed merchant test the team could not answer "did the
    browser ever reach our callback?", and defaulted to changing URL parameters — the one
    thing they could change — rather than localising the failure.
---

## The pattern

A redirect handoff has a hole in the middle. You send the user away; a third party does
something you cannot observe; control may return, or may not. When it does not, there are
two entirely different worlds:

1. **The third party never came back.** Nothing downstream of your redirect ever ran. No
   change to your callback, your state handling, or your token exchange can affect this.
2. **It came back and you rejected it.** Missing parameters, unknown state, expired state,
   replayed state, a failed exchange.

These demand opposite responses — escalate to the vendor, or debug your own code — and
without a durable record you cannot tell them apart. What you can always do is change
request parameters, so that is what teams do: they tune the thing they can see, for weeks.

## The trap that makes it worse

Short-lived security records are usually swept eagerly, and the natural place to sweep
them is at the start of the next attempt:

```ts
export async function startOAuth(deps, userId) {
  await sweepExpiredStates(now)          // <-- deletes the PREVIOUS failure's evidence
  const state = randomBytes(32).toString('base64url')
  await createDocWithId('oauthStates', sha256(state), { expiresAt, /* 10 min TTL */ })
}
```

So the diagnostic act — "let me try again and watch" — destroys the data from the attempt
you were trying to diagnose. The security TTL (short, by design) silently becomes the
retention policy for your only forensic record.

## The fix: a separate, durable, secret-free attempt trail

Keep the security record short-lived. Add a **second** record with a different lifetime and
a different job:

```ts
// Retention is a DIAGNOSTIC decision (days), independent of the 10-minute state TTL.
export const ATTEMPT_RETENTION_MS = 7 * 24 * 60 * 60_000

const attemptId = await startAttempt({
  requestedByUserId, now,
  authorizationVariant: 'force_auth-only-2026-08-31',   // WHICH experiment produced this
  authorizationHost: new URL(authorizeUrl).host,
  authorizationParameterNames: [...new URL(authorizeUrl).searchParams.keys()],  // NAMES only
})
// Carry it on the state row so the callback can advance the right attempt
// from the state HASH — never from the raw state value.
await createDocWithId('oauthStates', stateHash, { ..., attemptId })
```

Then record the boundary at every exit, not just the failure:

```text
started ──> callback_received ──> exchange_started ──> connected
              │                        │
              │                        └─> exchange_failed_transport | _response
              └─> rejected_unknown_state | _expired_state | _replayed_state
```

The diagnostic power is in the **stuck** state, not the error text:

| Last status | Meaning | Action |
|---|---|---|
| `started`, never advanced | The vendor never returned the browser | Escalate to the vendor. Stop editing your code. |
| `callback_received` + `rejected_*` | They returned; you refused it | Debug your state/session boundary |
| `exchange_started` + failure | They issued a code; your exchange broke | Debug the token layer |
| `connected` | Works | — |

## Two constraints that are not optional

**Store no secrets, structurally.** These rows are read by admins and pasted into support
tickets. Record parameter NAMES, never values — `state` is a CSRF secret and an
authorization code is a bearer credential. Make the admin projection an explicit field
list rather than a filter over the document, so a field added later cannot leak by
default:

```ts
// Redaction by construction: only these fields can ever be returned.
return docs.map((doc) => ({
  attemptId: doc._id, status: doc.status, failureCategory: doc.failureCategory,
  authorizationHost: doc.authorizationHost,
  authorizationParameterNames: doc.authorizationParameterNames,
  startedAt: doc.startedAt, callbackReceivedAt: doc.callbackReceivedAt,
}))
```

Never store: raw state, authorization code, access/refresh tokens, signatures, full
authorize/callback URLs, cookies, or raw IPs.

**Diagnostics must never break the flow they observe.** Every write is best-effort, and
that has to be tested by breaking it, not asserted in a comment:

```ts
test('a diagnostics write failure does NOT break authorization', async () => {
  breakTheDiagnosticsBackend()
  const result = await handleRequest({ action: 'oauthStart', token })
  assert.equal(result.ok, true, 'OAuth proceeds even with diagnostics broken')
})
```

Observability that can take down the feature is a new failure mode, not a safety net.

## Checklist

- [ ] Can you answer, an hour after a failed attempt, whether the third party came back?
- [ ] Does your security record get swept by the NEXT attempt? Then it is not your trail.
- [ ] Is retention a diagnostic decision (days), separate from the security TTL (minutes)?
- [ ] Does the trail name the VARIANT, so an attempt says which experiment produced it?
- [ ] Parameter names only — no values, no full URLs?
- [ ] Is the admin projection an explicit allowlist of fields?
- [ ] Is there a test that breaks diagnostics and asserts the flow still works?
- [ ] Is the trail readable by an operator, or only by someone with database access?

## The meta-lesson

Three weeks of that incident were spent changing authorization parameters because the
parameters were the only visible surface. The actual missing thing was one bit of
information: **did they come back?**

**When a flow hands control to a third party, instrument the handoff before you tune it.
Otherwise every experiment costs a human round trip and still cannot tell you whose bug
it is.**
