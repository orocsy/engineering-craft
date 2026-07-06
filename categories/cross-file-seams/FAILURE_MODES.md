<!-- GENERATED — DO NOT EDIT.
     Canonical source: dev-pipeline plugin skills/cross-file-reasoning/FAILURE_MODES.md
     Published by /dev-pipeline:consolidate-lessons on 2026-07-06.
     Hand-edits here are overwritten on the next consolidation. Edit the plugin instead. -->

# Failure Mode Catalog

General-form bugs that hide at file boundaries. Each entry was a real production-bound bug that the implementing agent shipped and a reviewer (automated or human) caught after the fact. The catalog grows; do not delete entries even after they become "obvious" — that's exactly how they recur.

**How to use this file:**
- Before running the seven traces in `SKILL.md`, skim the catalog. If the diff matches a pattern below, dive into the matching trace.
- When you ship a bug a reviewer catches that is NOT in this catalog, add an entry. The pattern's general form goes in `## Pattern`; the specific instance goes in `## Examples`.
- Keep entries GENERAL. Project-specific details belong in the `Examples` section, not the `Pattern` body.

**This file is CANONICAL for cross-file-seam failure modes (READ ONCE):**
There is exactly ONE author for every cross-file-seam lesson, and it is this file. It lives in the plugin because the `cross-file-reasoning` skill reads it inline on every implement/review — it must be present with zero external dependency, and appendable mid-trace the instant a reviewer catches something. So:
- **Author here, always.** When you catch a new cross-file failure mode, add it to this file immediately — you need it on the very next trace.
- **engineering-craft's `categories/cross-file-seams/` is a GENERATED, read-only MIRROR of this file.** `/dev-pipeline:consolidate-lessons` publishes this catalog there (one-way) for the public archive. **Never hand-edit the mirror** — the next consolidation overwrites it. Edit here; the mirror follows.
- **Deeper, broader topics stay in engineering-craft's hand-authored categories.** Cross-file env-var collapse (entry #2) is the *operational* slice; the full "4-consumer rule" treatment lives in engineering-craft `config-drift`. Single-place-fix blindness (#8/#9) is the operational slice; the security-literal sweep lives in `grep-for-siblings`. Link to those for depth — don't restate them here, and don't copy this catalog's entries into them. Each fact has one home.

Net: add cross-file failure modes HERE and move on. Consolidation mirrors them to the public repo; you never touch engineering-craft by hand for cross-file content.

---

## Index

1. [Framework-prefix doubling](#1-framework-prefix-doubling)
2. [Empty-string env-var collapse (`??` instead of `||`)](#2-empty-string-env-var-collapse)
3. [SDK option name unverified against installed type defs](#3-sdk-option-name-unverified)
4. [Conditional coupling (effect gated by unrelated condition)](#4-conditional-coupling)
5. [In-tx side-effect fires on rollback (fire-and-forget queue)](#5-in-tx-fire-and-forget-rollback-ghost)
6. [Wrapper drops inner lifecycle (Observable / Promise / iterator)](#6-wrapper-drops-inner-lifecycle)
7. [Mock-based test passes while real interface drifts](#7-mock-real-interface-drift)
8. [Single-place fix where root cause spans multiple sites](#8-single-place-fix-pattern-blindness)
9. [Removing "dead code" without proving what it guarded](#9-removing-load-bearing-code)
10. [Test rewritten alongside behavior change (tautology)](#10-test-rewritten-to-match-new-behavior)

---

## 1. Framework-prefix doubling

### Pattern

A file's URL or path is determined by COMPOSITION of: host + CDN router + framework prefix (basePath, locale prefix, route group, version segment) + file path under the routing root.

When a developer reads the file path in isolation and assumes that IS the URL, they double-count any prefix the framework adds at runtime.

**The general form**: `effective_path = framework_prefix + file_path`. If you write `framework_prefix` in BOTH places (config and file path), the runtime concatenates them — once each — and the URL silently has two copies.

### Anti-pattern

```ts
// next.config.js
module.exports = { basePath: '/admin' };

// app/admin/posthog/[...path]/route.ts  ← `admin` in BOTH the config AND the file path
```

Effective URL becomes `/admin/admin/posthog/*`. The client hits `/admin/posthog/*` (what the dev expected) → 404.

### Right pattern

```ts
// next.config.js
module.exports = { basePath: '/admin' };

// app/posthog/[...path]/route.ts   ← path under the routing root, basePath added by framework
```

Effective URL is `/admin/posthog/*`. Matches client expectation.

### Test

For every new route file, state the effective URL out loud BEFORE moving on:
```
basePath(/admin) + locale(none) + file(/posthog/[...path]) → /admin/posthog/*
```
Then `grep` for any client-side fetch / link that targets that URL. If they don't match, the bug is sitting there.

### Examples

- **Caught in post-merge review**: a PostHog reverse-proxy route file at `app/admin/posthog/[...path]/route.ts` under a Next.js `basePath: '/admin'`. The basePath was prepended at runtime → effective path `/admin/admin/posthog/*`. Every client analytics request 404'd silently. Fix: move the file out of the `admin/` dir to `app/posthog/[...path]/route.ts`. Added an E2E test to pin the convention.

### Related traces

- Trace 2 (Route / path / URL trace) in `SKILL.md`

---

## 2. Empty-string env-var collapse

### Pattern

The nullish-coalescing operator `??` falls back ONLY on `null|undefined`. Empty strings, `0`, and `false` pass through. Many secret-injection pipelines — GitHub Actions `${{ secrets.X }}` with an unset secret, Vercel optional env with a blank value, Docker `-e X=` with no value — pass `''` to the runtime, not `undefined`.

When code uses `process.env.X ?? 'sensible-default'`, an unset secret pipes through as `''` and the default is silently lost. The downstream system sees an empty string (empty host, empty token, empty URL) and either fails opaquely or — worse — silently misroutes / misauthenticates.

### Anti-pattern

```ts
const host = process.env.POSTHOG_HOST ?? 'https://eu.posthog.com';
// POSTHOG_HOST="" → host = "" (not the EU default)
// PostHog client constructed with empty host → analytics misrouted
```

### Right pattern

```ts
const host = process.env.POSTHOG_HOST || 'https://eu.posthog.com';
// POSTHOG_HOST="" → host = 'https://eu.posthog.com' (default applied)
// POSTHOG_HOST=undefined → same
```

Or be explicit:
```ts
const host = process.env.POSTHOG_HOST?.trim() || 'https://eu.posthog.com';
```

### Test

For every `process.env.X ?? default` in the diff, ask: "in CI / Vercel / Docker, can this env-var arrive as an empty string?" If yes (default for unset secrets / blank vars), use `||` instead. Default to `||` for env-var defaults; reserve `??` for cases where `''` is a legitimately distinct value (rare for config).

### Examples

- **Caught in post-merge review**: a service constructed PostHog with `process.env.POSTHOG_HOST ?? 'https://eu.posthog.com'`. When the `POSTHOG_HOST` CI secret was unset, the deploy injected `POSTHOG_HOST=""` (empty), `??` passed it through, and the client built with an empty host. Fix: change `??` to `||`.

### Related traces

- Trace 1 (Env-var trace) in `SKILL.md`

---

## 3. SDK option name unverified

### Pattern

SDK options are versioned. Memory, blog posts, AI training data, and even the SDK's own documentation (which often defaults to the latest release) may name an option that DOES NOT EXIST in the version pinned in `package.json`. Most SDKs accept unknown option keys without warning — the misnamed option is silently ignored at runtime, and the developer never sees a type error because TypeScript widens config objects.

The bug surfaces only when the feature the option was supposed to enable doesn't work (session recording masks nothing, exceptions get double-reported, retries don't happen). Time to diagnose: hours.

### Anti-pattern

```ts
// posthog-js v1.376 has no `maskAllText` and no `disable_exception_autocapture`
posthog.init(key, {
  session_recording: {
    maskAllText: true,                  // ← does not exist in v1.376
  },
  disable_exception_autocapture: true,  // ← does not exist; correct option is capture_exceptions: false
});
// SDK silently ignores both. Session replays leak PII. Exceptions are double-reported.
```

### Right pattern

Before setting an SDK option, verify the option exists in the installed version's type defs:

```bash
PKG=posthog-js
OPTION=maskAllText
grep -rn "$OPTION" node_modules/$PKG/dist/ | head -10
# If empty: option does not exist. Look up the right name.
```

Document the verification in the engineering rationale:
```
// Verified `maskTextSelector` in node_modules/posthog-js/dist/main.d.ts (line 482).
session_recording: { maskTextSelector: '*', maskAllInputs: true },
```

### Test

For every SDK config option in the diff, grep the installed `.d.ts`. If the option is absent: pick a different option that IS in the type defs, OR accept the feature isn't supported in this version, OR upgrade the package (with its own MIU).

**Bonus signal**: if the SDK has a `strict: true` mode or a `validateConfig` flag, enable it in dev. Some SDKs (Stripe SDK, AWS SDK v3) error on unknown keys when strict; most don't.

### Examples

- **Caught in post-merge review**: a PostHog provider set `session_recording: { maskAllInputs: true }` thinking that masked everything. It only masks `<input>` elements; customer phone numbers rendered as ordinary `<td>` text leaked into recordings. Investigation: posthog-js v1.376 has NO `maskAllText` option; correct API is `maskTextSelector: '*'`. Fix: use the CSS-selector form.
- **Caught in review**: a reviewer suggested `disable_exception_autocapture: true` for posthog-js. Verified absent in v1.376 type defs. Correct option is `capture_exceptions: false`. Kept original code.

### Related traces

- Trace 3 (SDK option-name trace) in `SKILL.md`

---

## 4. Conditional coupling

### Pattern

Multiple effects placed inside a single conditional gate (`if (CONDITION) { effectA(); effectB(); }`) become coupled to that gate's condition. When `CONDITION` is false, ALL gated effects skip — even if some of them have nothing to do with `CONDITION`.

The bug surfaces when the system runs with the condition false (an env-var missing, a feature flag off, a user logged out) and an UNRELATED effect that was supposed to fire (logging, error tagging, audit trail) silently doesn't.

The fix is to give each effect ITS OWN gate matching THAT effect's required preconditions.

### Anti-pattern

```tsx
useEffect(() => {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return; // gates PostHog
  if (!user) return;                                 // gates user-aware effects

  posthog.identify(user.id, { tenantId: user.tenantId });
  Sentry.setUser({ id: user.id, tenantId: user.tenantId });  // ← Sentry has nothing to do with PostHog!
  Sentry.setTag('tenantId', user.tenantId);
}, [user]);
```

When `POSTHOG_KEY` is unset (e.g. local dev, a deploy that skipped the PostHog secret), Sentry tagging silently doesn't happen → every admin client error fingerprints as `no-tenant`.

### Right pattern

Split into independent effects with the correct precondition each:

```tsx
useEffect(() => {
  if (!user) return;
  Sentry.setUser({ id: user.id, tenantId: user.tenantId });
  Sentry.setTag('tenantId', user.tenantId);
}, [user]);

useEffect(() => {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  if (!user) return;
  posthog.identify(user.id, { tenantId: user.tenantId });
  posthog.group('tenant', user.tenantId, { ... });
}, [user]);
```

### Test

For every effect inside a conditional, ask: "what's the MINIMUM precondition this effect needs?" If the gate above it has MORE conditions than the minimum, you've coupled the effect to extra conditions it shouldn't care about.

In React: a useEffect with multiple unrelated effects bodied is a code smell. Split into multiple useEffects.

### Examples

- **Caught in post-merge review**: a telemetry provider had Sentry `setUser` and `setTag` inside the same `useEffect` that gated PostHog init on `NEXT_PUBLIC_POSTHOG_KEY`. When PostHog wasn't configured (preview deploys without the secret), client errors fingerprinted as `no-tenant` because the Sentry tags never set. Fix: separate Sentry tagging into its own useEffect.

### Related traces

- Trace 6 (Conditional-coupling trace) in `SKILL.md`

---

## 5. In-tx fire-and-forget rollback ghost

### Pattern

Fire-and-forget queued external operations (PostHog `capture`, Stripe `events.create`, Slack webhook POST, BullMQ `add` without tx-bound queue, SendGrid `send`) enqueue immediately and return. The data is in the SDK's internal batch buffer, awaiting a flush.

When this happens inside a database transaction that subsequently ROLLS BACK (serialization conflict, post-listener exception, manual rollback), the queued external operation STILL FLUSHES — the SDK has no knowledge of the DB transaction.

Result: the external system records an event for work that the database never committed. Ghost emails sent, ghost analytics events captured, ghost webhook deliveries.

### Anti-pattern

```ts
await prisma.executeInSerializableTransaction(async (tx) => {
  await tx.booking.create({ data: { ... } });
  this.eventEmitter.emit('booking.created', new BookingCreatedEvent(...));
  // ← listener does `posthog.capture('booking_created', ...)`
  // ← capture is enqueued in posthog-node's batch buffer

  // Later in the SAME tx, some OTHER write throws → tx rolls back
  await tx.someOtherThing.update({ ... });  // throws
  // Booking row gone. But posthog.capture is still queued, flushes anyway.
});
```

### Right pattern

Three options, in order of preference:

1. **Move the side effect OUT of the tx** — emit AFTER tx commits successfully:
   ```ts
   const booking = await prisma.executeInSerializableTransaction(async (tx) => {
     return await tx.booking.create({ data: { ... } });
   });
   // Tx committed. Now emit:
   this.eventEmitter.emit('booking.created', new BookingCreatedEvent(booking));
   ```

2. **Transactional outbox pattern** — write the event to a `domain_events` table INSIDE the tx; a separate worker drains the outbox and publishes. Outbox row rolls back with the tx, so the worker never sees ghost events.

3. **Accept the trade-off with documentation** — if the cost of #1 or #2 is too high for the value of the event (e.g. rare rollback, low-volume analytics, downstream system has dedupe), document the trade-off in the engineering rationale and the source file so future readers don't re-litigate.

### Test

For every side effect inside a tx, ask: "if this tx rolls back AFTER the side effect runs, does the side effect un-happen?" If no, you have a ghost-event risk. Either move it out, use outbox, or document.

For each side-effect type, build the matrix (from Trace 4 in `SKILL.md`):
- Listener throws → tx rolls back. OK.
- Listener succeeds, OTHER tx work throws → ghost event. Trade-off.

### Examples

- **Caught in post-merge review**: an event-bridge handler (`onBookingCreated`) runs inside a serializable tx. PostHog `capture` is fire-and-forget. Estimated <0.1% of operations under normal load would emit ghost events. Fix: documented as accepted trade-off; transactional outbox tracked as follow-up.

### Related traces

- Trace 4 (Event lifecycle trace) in `SKILL.md`

---

## 6. Wrapper drops inner lifecycle

### Pattern

When you wrap a long-running primitive (Promise, Observable, async iterator, EventEmitter, generator, file descriptor) inside another primitive of the same kind, the wrapper takes on the lifecycle responsibilities of the inner.

Specifically: if the OUTER is cancelled / closed / unsubscribed, the wrapper must propagate the cancellation INWARD. If it doesn't, the inner keeps running (timer not cleared, subscription not unsubscribed, listener not removed), and the wrapper's apparent cancellation is a lie.

This is invisible at the file level because the wrapper code "looks right" — the bug is the MISSING teardown propagation, not anything the wrapper writes.

### Anti-pattern (RxJS)

```ts
intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
  return new Observable<unknown>((subscriber) => {
    runWithTenantContext({ tenantId, requestId }, () => {
      next.handle().subscribe({   // ← inner Subscription NOT captured
        next: (val) => subscriber.next(val),
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });
    });
    // ← no teardown returned. Outer unsubscribe is a no-op.
  });
}
```

When the client cancels (HTTP/2 stream close, request timeout, `takeUntil`), the OUTER's subscriber transitions to closed, but the inner subscription keeps emitting → the route handler keeps running → "subscriber leaked" warnings in production.

### Right pattern

Capture the inner subscription and return it as the teardown:

```ts
intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
  return new Observable<unknown>((subscriber) => {
    let innerSub: Subscription | undefined;
    runWithTenantContext({ tenantId, requestId }, () => {
      // ← Sentry scope ALSO needs to be set HERE (inside ALS context)
      innerSub = next.handle().subscribe({
        next: (val) => subscriber.next(val),
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });
    });
    return () => innerSub?.unsubscribe();   // ← teardown propagated
  });
}
```

Same pattern for Promises (return a cleanup function from the wrapped Promise's executor, or use AbortController), async iterators (implement `return()` to invoke the inner's `return()`), event emitters (track listener registrations and remove them on dispose).

### Test

For every `new Observable(subscriber => {...})`, `new Promise(resolve => {...})`, `async function*` in the diff:
1. Is there a long-running primitive being wrapped? If yes, identify the teardown contract.
2. Does the wrapper propagate teardown? `grep` for `unsubscribe`, `abort`, `removeListener`, `return()`, `close()` in the wrapper body.
3. If absent: this is a leak. Add the teardown.

### Examples

- **Caught in post-merge review**: a NestJS interceptor wrapped `next.handle().subscribe(...)` inside a new Observable without capturing the inner Subscription. Client cancellation (RxJS `takeUntil`, HTTP/2 stream close, request timeout) did not propagate. Fix: capture `innerSub`, return `() => innerSub?.unsubscribe()`.
- **Test-strategy corollary (same incident's later audit)**: every existing spec stubbed the handler with `of(...)` — a source that completes synchronously, so the teardown path was NEVER exercised and the buggy wrapper passed the whole suite. Lifecycle tests need non-completing sources: `new Observable(() => () => teardownSpy())`, a `NEVER` source, and a sync-throw source — each asserting its specific lifecycle invariant.

### Related traces

- Trace 7 (Wrapper-lifecycle trace) in `SKILL.md`

---

## 7. Mock-real interface drift

### Pattern

A test mocks a service with a small object literal (`{ method: jest.fn() }`). The real service later grows new methods, new fields, new constructor args, new injected dependencies. The mock object literal stays the same shape because TypeScript doesn't force test-side mocks to match the production interface byte-for-byte (especially when the mock is typed as `Partial<X>` or `as unknown as X`).

When the production code calls a new method that the mock doesn't have, the test crashes — which is the OK case. The dangerous case: the production code starts depending on a SIDE EFFECT of an existing method (writes to DB, fires external event, sets Sentry scope), and the mock's `jest.fn()` records the call but doesn't reproduce the side effect. Tests pass; production behavior diverges.

### Anti-pattern

```ts
// posthog.service.ts now ALSO emits a Sentry breadcrumb on capture(). Test:
const mockPostHog = {
  capture: jest.fn(),  // ← records call, but no breadcrumb side effect
};
const service = new BookingService(prisma, redis, mockPostHog, ...);

it('captures slot_contention on lock failure', async () => {
  await expect(service.createBooking(...)).rejects.toThrow();
  expect(mockPostHog.capture).toHaveBeenCalledWith('slot_contention_detected', ...);
  // ← PASS. But the Sentry breadcrumb the production capture() emits was never tested.
});
```

### Right pattern

Three layers of defense:

1. **Strong typing on the mock**: cast as the full interface, not `Partial`. TypeScript will catch missing methods at the mock declaration site.
2. **Assert the side effect, not just the call**: if `capture()` has a side effect that downstream code depends on, the test must assert that downstream observable. Even if it requires a slightly higher-fidelity mock.
3. **One integration / smoke test**: complement mock-based unit tests with at least one test that wires up the REAL service (or a high-fidelity in-memory double). For analytics SDKs, this can be as simple as a test that initializes the real client pointing at a no-op endpoint and asserts the request body shape.

### Test

For every test mock in the diff:
1. Is the mock fully typed against the real interface? If `Partial<X>` or `as any`, why?
2. Does the production code under test have side effects beyond the return value? Are they asserted?
3. Is there an integration / smoke test that uses the real interface?

### Examples

- **Real incident**: a service constructor grew a 9th arg (a telemetry service). Two spec files instantiated that service directly. Forgetting the mock at one site → the spec failed at instantiation (TS error) immediately. OK case. Counter-example: `posthog.identify(userId, { tenantId, role })` mocked as `{ identify: jest.fn() }` — passes regardless of whether `distinctId`, `groupId`, `properties` are correct. The dashboard-side correctness was never asserted.

### Related traces

- Trace 5 (Mock-completeness trace) in `SKILL.md`

---

## 8. Single-place fix, pattern blindness

### Pattern

A bug surfaces at one place. The agent fixes THAT place. The root cause was a general class of mistake that has 3 other instances in the codebase, each of which will surface as a separate "bug" later.

Operationally identical to `CLAUDE.md → Rule 11` ("fix patterns, not enumerations") but framed as a cross-file failure mode: the OTHER instances exist in OTHER files, which the single-file-focused agent never opens.

### Anti-pattern

User: "the booking page for `/en/admin` shows a fake store".
Agent: adds a redirect for `/admin` to the booking app's catch-all.
Next week — user: "`/en/media` shows a fake store too".
Agent: adds a redirect for `/media`.

### Right pattern

Trace UP to the general class:
- *Why* does `/en/admin` show a fake store? → the catch-all renders `buildFallbackTenant()` for any error from `getTenant`.
- *Why* did `/en/admin` trigger the fallback path? → the booking API returns 404 for unknown slugs → `getTenant` returns `'not-found'` → catch-all rendered the fallback even for `'not-found'` (collapsing two semantically different cases).

Fix at the class level:
- `'not-found' → notFound()` (404 page).
- `'error' → buildFallbackTenant()` (degraded page for transient API failures, e.g. cross-region timeout / bot challenge).

Now every unknown slug 404s automatically. No per-slug fix needed.

### Test

Before declaring a bug fixed, ask: "what OTHER inputs would have triggered the same root cause, and does my fix cover them?" If you can list a finite set of inputs and your fix handles them one-by-one, you fixed the SYMPTOM, not the BUG.

### Examples

- **Caused a production outage**: the original "fix" was per-slug redirect rules. The right fix was to drop a fake-entity fallback for the `'not-found'` case (keep it for `'error'`).

### Related traces

This is meta — applies to every trace. Whenever you fix a finding, ask "is the fix class-level or instance-level?".

---

## 9. Removing load-bearing code

### Pattern

Operationally identical to `CLAUDE.md → Rule 18` and `docs/PHILOSOPHY.md §12`. Captured here as a CATALOG entry because the failure crosses files: the load-bearing code lives in file A, the comment that explains why lives in file A (sometimes), and the consumer that depends on the behavior lives in file B. Removing file A's code without consulting file B's expectation is a cross-file mistake.

### Anti-pattern

```tsx
// layout.tsx — pre-PR-#92
// Cross-continent fetch failures / timeouts surface as 404s because getTenant catches the error
// and returns 'error' — so build a fallback tenant shell to keep the page renderable.
if (tenantResult === 'error') return buildFallbackTenant(slug);
```

Agent reads this and thinks "fallback for unknown slugs — SEO pollution, delete". Deletes the fallback. Tests pass. PR merged. Real customer salons start 404'ing on transient API failures.

### Right pattern

Before removing:
1. **Read the comment.** Believe it.
2. **`git log -p -- <file>`** the introduction. Read the original commit message.
3. **Trace what OTHER branches do.** If `error → A` and `not-found → B`, they are TWO failure modes. Collapsing them is a semantic change.
4. **Chaos test.** Mock the upstream as failing. Watch what the user sees.
5. **Only then remove.** Don't rewrite the test alongside (see #10).

### Examples

- **Caused a production outage**: removed a `buildFallbackEntity()` helper thinking it was SEO pollution. It was actually transient-API-failure protection; removing it took real pages down the moment the upstream API had a transient failure.

### Related traces

- Cross-file aspect: the consumer in `services-page.tsx` (and other tenant-aware pages) inherited the fallback behavior via `layout.tsx`'s tenant context. Removing the fallback in layout.tsx silently changed behavior everywhere downstream.

---

## 10. Test rewritten to match new behavior

### Pattern

Operationally identical to `CLAUDE.md → Rule 19`. Cross-file framing: the test (file A) and the production code (file B) are under the same author's control. Rewriting both in the same PR makes the test pass — but it proves nothing, because the test was AUTHORED to match the new code.

### Anti-pattern

```ts
// services-page.test.tsx — BEFORE
it('renders fallback tenant with ALL 5 new fields null when getTenant returns error', ...);

// services-page.test.tsx — AFTER (same PR as the production code change)
it('calls notFound when getTenant returns error (no fake-tenant fallback)', ...);
```

Both tests pass — in their respective worlds. The opposite assertions reveal that the rewrite GAVE the test a new identity to match the new code, instead of letting the existing test fail and triage the failure.

### Right pattern

Change the code. DON'T touch the existing test. Run the suite. See what fails. Decide:
- If the old behavior was correct → revert your code change.
- If the old behavior was wrong → DELETE the old test with a comment explaining why, and ADD a new test asserting the new behavior. Two separate operations, two separate justifications.

Or: write the assertion at the INVARIANT level — "real tenant URLs do not return 404" — which stays true across both implementations.

### Examples

- **Bug shipped to production**: a page test asserted the fallback behavior. The change rewrote that same test to assert the OPPOSITE (no fallback). Both versions passed green. The regression shipped — the test was rewritten to match the new (wrong) behavior instead of catching it.

### Related traces

- Trace 5 (Mock-completeness trace) — adjacent failure mode. The mock-rewrite version of this anti-pattern is "rewrite the mock to expose the new method and call it correct" instead of "let the old mock fail and triage".

---

## 11. Claimed-but-unlanded fix (stale commit-message vs reality)

### Pattern

A commit message, journal entry, or post-review reply CLAIMS to have fixed a finding. But the diff for that commit did not actually modify the file containing the finding — or modified a sibling file with similar content. Tests pass (the test file the agent looked at also didn't change). The next reviewer sees the same finding and either re-flags it (correctly) or trusts the claim (incorrectly).

The root cause is almost always single-file thinking applied to the FIX phase: the agent saw the finding's general shape, found ONE place that matched the shape, fixed it, and assumed the fix was complete. The OTHER place(s) carrying the same anti-pattern stayed untouched. The commit message describes "the fix" as if singular.

### Anti-pattern

A review finds: `process.env.POSTHOG_HOST ?? '...'` is unsafe (empty string defeats nullish-coalescing).

The agent finds ONE occurrence in the API service and another in an admin provider. Fixes only the admin one. Writes a commit message that says: "P2 fix: POSTHOG_HOST `??` → `||`". Pushes. The API one stays broken. The next review sees the same finding on the API file and re-flags. The agent thinks the reviewer is "re-flagging a fixed issue" and dismisses.

The asymmetry: the fix was real but partial. The commit message generalized to "the fix" when the diff was specific.

### Right pattern

Before claiming a fix complete, `grep` the ENTIRE repo for the bug's general shape and verify each match is either (a) fixed, (b) explicitly out-of-scope, or (c) doesn't actually have the same problem. List every match in the commit message even if it's just "verified not affected".

For env-var fallbacks specifically: `grep -rn 'process\.env\.[A-Z_]* \?\?' apps/ packages/` BEFORE committing the fix. Either every match becomes `||` (or has a documented reason for `??`), or the fix is incomplete.

For ANY review finding with a general shape (a regex, a typo class, a misuse of an SDK option), the verification step is: `grep` the codebase for the shape and confirm the fix covers every instance.

### Test

After writing a commit message that says "X fix", before pushing:
1. Re-read the file the message names.
2. `grep` for the bug shape across the entire repo.
3. Verify every match is addressed OR explicitly listed as out-of-scope.
4. If the commit message uses "the fix" / "this fix", verify it really is THE fix (singular), not ONE OF the fixes (partial).

When a reviewer re-flags something you thought was fixed: BEFORE arguing it's a stale flag, `grep` for the original bug shape and re-verify YOUR fix is actually present on the line the reviewer cites.

### Examples

- **Caught when a re-flag was almost dismissed as stale**: an earlier commit's message claimed "POSTHOG_HOST now uses `||` not `??` so an empty-string secret falls back to the default". But `git log -p` on the actual file showed that commit did not touch it at all — the `??` survived in the API code. The reviewer re-flagged it on a later round (correctly). When investigating the re-flag, the agent assumed it was stale and almost dismissed it; checking the CURRENT file content showed the bug was still there. The lesson: verify a re-flag against the current file, never against a prior commit message's claim.

### Related traces

- This is a meta-pattern that compounds OTHER traces: any of the seven traces in `SKILL.md` becomes worse when the agent "fixes" the pattern in one file and claims general resolution.
- Related to Failure Mode #8 (single-place fix, pattern blindness) — that's about UPSTREAM root-cause class; this is about DOWNSTREAM verification across instances.

---

## 12. Side effect ships untested because it's invisible to the return value

### Pattern

A function's tests assert its RETURN VALUE and its THROWN errors. A side
effect — `posthog.capture()`, `eventEmitter.emit()`, an audit-log write, a
webhook publish, a queue `add()`, `Sentry.captureException()` — is neither.
The mock for the side-effecting dependency satisfies the type signature
(constructor arity, method exists), the function returns/throws correctly,
every test passes — and the side effect, which is often the ENTIRE POINT of
the code (the dashboard signal, the audit trail, the notification), is never
asserted. It ships unverified through every gate.

Distinct from Failure Mode #7 (mock-real interface drift): #7 is about the
mock's SHAPE diverging from the real interface. THIS is about the mock's
shape being correct but no test asserting the call happens at all (or
asserting only `toHaveBeenCalled()` with no argument check — which passes
even when the payload is wrong).

### Anti-pattern

```ts
// Service grows a 9th constructor arg (PostHogService) + 6 capture sites.
const posthog = { capture: jest.fn() } as unknown as PostHogService;
const service = new BookingService(..., posthog);

it('rejects double-booking', async () => {
  await expect(service.createBooking(contendingDto)).rejects.toThrow();
  // ✅ return/throw asserted. ❌ the capture('slot_contention_detected', ...)
  //    that the whole observability MIU exists for is NEVER asserted.
});
```

### Right pattern

```ts
it('captures slot_contention_detected on the lock-busy path', async () => {
  redis.acquireLock.mockResolvedValueOnce(false);
  await expect(service.rescheduleBookingAdmin(...)).rejects.toThrow();
  expect(posthog.capture).toHaveBeenCalledWith(
    'slot_contention_detected',
    expect.objectContaining({ contentionType: 'lock_busy', operation: 'reschedule_admin', staffId }),
    expect.objectContaining({ tenantId, distinctId: staffId }),
  );
});

// And the negative: capture does NOT fire on the happy path.
it('does not capture contention when the lock is acquired', async () => {
  redis.acquireLock.mockResolvedValue('token');
  await service.rescheduleBookingAdmin(...);
  expect(posthog.capture).not.toHaveBeenCalledWith('slot_contention_detected', ...);
});
```

### Test

For every NEW side-effecting call site the diff introduces (grep the diff
for `.capture(`, `.emit(`, `.add(`, `.publish(`, audit/log writes), ask:
"is there a test that asserts THIS call fires with THIS payload?" A bare
`toHaveBeenCalled()` with no `With(...)` does not count. If the side effect
is conditional, also assert it does NOT fire in the negative branch.

Proactive prevention: the `test-planner` agent's "Observable Side Effects /
Instrumentation" category enumerates these scenarios BEFORE code is written.
If the test plan has no side-effect scenarios for a feature whose whole
purpose is a side effect, the plan is incomplete.

### Examples

- **Caught in pre-push review (3 prior review rounds had missed it)**: a change
  added six `posthog.capture('slot_contention_detected', ...)` sites at booking
  contention throw paths. The PostHogService mock satisfied the constructor
  arg; 119 tests passed; ZERO asserted any capture fired. The pre-push review
  caught it. The fix added explicit capture assertions and, in the process,
  discovered a SEVENTH contention path (a lock-busy reschedule path) that had no
  capture at all — invisible precisely because nothing tested the captures.

### Related traces

- Trace 5 (Mock-completeness) in `SKILL.md` — adjacent; that one is shape drift, this is coverage of the call itself.
- Failure Mode #7 — the shape-drift sibling.

---

## 13. Workspace package that works in one build context but not another

### Pattern

A monorepo workspace package (`@scope/utils`, `@scope/ui`) is consumed by multiple apps, but the apps have DIFFERENT build/runtime models — and the package only works in some of them. The most common shape: the package ships RAW TypeScript (`main → ./src/index.ts`, no compiled `dist/`). That's fine for BUNDLED consumers (a Next.js/webpack app transpiles the workspace source) but breaks NON-bundled consumers:

- a `tsc`-compiled, `node dist/main` service can't resolve it in an isolated Docker build (the Dockerfile COPYs only that app, not `packages/`), and even if resolved, the emitted `require('@scope/utils')` points at raw `.ts` that Node can't execute;
- a CI job that builds the image may run ONLY on push to main (not on PRs), so the failure is invisible until after merge.

It "works on my machine" because the local monorepo has the symlink + a TS-aware test runner (ts-jest). Each context assembles the workspace differently: local symlink vs isolated Docker COPY vs Vercel `buildCommand` vs the bare node runtime.

### Anti-pattern

```jsonc
// packages/utils/package.json — raw-TS source package, no build
{ "main": "./src/index.ts" }
```
```ts
// a tsc → node dist/main service imports it:
export { scrub } from '@scope/utils';   // tsc emits require('@scope/utils') → raw .ts → runtime crash
// Docker build: COPY the service dir only → TS2307 (packages/ not in image)
// CI: Build Image job is `on: push: [main]` → never runs on the PR → merges green, breaks main
```

### Right pattern

Decide, per package, which consumers it must serve, and make it consumable by ALL of them:

- **Compiled package** (robust, single-source): add a build step emitting `dist/` JS + `.d.ts`; `main → dist`, `files: ["dist"]`; an `exports` split (`types → src` so type-check needs no build, `default → dist` for runtime/bundler). Every pipeline builds it first (turbo `^build`; Vercel `--filter=<app>...`; Dockerfile copies + builds it; jest maps the package → src). Now bundler, node runtime, and tests all work from one source.
- **Or inline** (only for trivial, rarely-changing snippets — a regex, a constant): copy into the non-bundled consumer with a "keep in sync" note. Do NOT inline large or compliance-critical code (drift is the bigger risk than the coupling).

### Test

- For any new `import` of a `@scope/*` workspace package from a non-bundled consumer (a `tsc`+node service, a CLI), ask: "does this package emit runnable JS, and does THIS consumer's build context contain it?"
- Run the REAL production build of every affected deployable — the container image (`docker build`), the exact Vercel `buildCommand` — not just `turbo build`.
- Check CI triggers: any build job gated to a branch (not PRs) must be run locally before merge.

### Examples

- **Broke `main` after a green PR**: a shared PII scrubber moved into a workspace package shipping raw TS. The bundled Next apps went green (they transpile it) and merged; the API's isolated Docker build (gated `on: push: [main]`) then failed on `main` with TS2307, and would have crashed `node dist/main` at startup. The first "fix" only added `transpilePackages` (bundler-only) — didn't touch the API. Resolved by compiling the package (dist JS + exports split) and wiring all four build contexts (Vercel `--filter=app...`, Dockerfile copy+build+root-tsconfig, jest mapper, turbo `^build`); verified with a real `docker build` + runtime `require` before merge. The two prior misses came from local gates (jest/tsc/one app's build) not exercising the Docker context.
- **Sibling build-invocation in a dormant CI workflow (same incident, later review)**: a `workflow_dispatch`-only workflow built apps with raw `pnpm --filter <app> build` (no deps-first `...`) — the identical TS2307 class, latent because that workflow never ran on the PR. Caught by grepping ALL workflow files for direct build invocations before merge. This trace must cover every CI file, not just the workflows that ran.

### Related traces

- Trace 1 (Env-var) and Trace 2 (Route) are the in-repo cousins; this is the cross-BUILD-CONTEXT version. Validate's "Deployment-Build Parity" step + the MIU "Build/Deploy/Runtime impact" field are the operational gates.

---

## Template for new entries

When adding a new entry, follow this skeleton. Keep the pattern GENERAL — instance details go in `Examples`.

```markdown
## N. Short title (general class, not project name)

### Pattern

2-4 sentences. What's the general shape of the mistake. Why does the WRONG thing look right. Where do the consumer and producer live (which files / which subsystems).

### Anti-pattern

```<lang>
// minimal code showing the wrong shape
```

### Right pattern

```<lang>
// minimal code showing the correct shape
```

### Test

How to spot this BEFORE shipping. The trace from `SKILL.md` to run. The grep / question to ask.

### Examples

- **YYYY-MM-DD repo PR #N (reviewer-name finding #M)**: one-sentence project-specific instance, with file path and the actual fix.

### Related traces

- Trace N (name) in `SKILL.md`
```

---

## Meta: why this catalog exists

The session that triggered this catalog's creation shipped 4 cross-file bugs in a single PR, all caught by an automated reviewer post-push, none caught by the implementing agent during `/dev-pipeline:implement` OR during its own `/dev-pipeline:review` self-review.

The unifying pattern: **single-file thinking**. The agent read each touched file deeply, made locally-correct changes, and shipped. The bugs lived at the seams the agent never looked at:

- PostHog proxy file ←→ Next.js `basePath` config (Failure mode #1)
- POSTHOG_HOST consumer ←→ GitHub Actions secret pipeline (Failure mode #2)
- Sentry tag effect ←→ PostHog gate condition (Failure mode #4)
- Interceptor outer Observable ←→ NestJS inner Subscription (Failure mode #6)
- PostHog session-recording option ←→ posthog-js v1.376 type defs (Failure mode #3)

This catalog encodes the seams. The skill in `SKILL.md` operationalizes the checks. The user's standing instruction: "each time I make a mistake, add to proper skills. Mistakes should be in general form as general as possible."

When you ship a bug a reviewer catches, ADD AN ENTRY. The catalog only works if it grows.
