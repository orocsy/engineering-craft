---
title: Measure the Request Chain Before Blaming the SDK — Collapse Serial Round Trips
type: pattern
maturity: verified
last-referenced: 2026-10-12
impact: HIGH
impact-description: |
  A slow user action gets blamed on the framework or SDK ("it validates every
  call", "there is no batch update"), so nobody fixes it. The real cost is
  usually the number of serial round trips times the per-request latency of a
  gateway, often far from the user. Moving the orchestration server-side into
  one request, and running independent items a few at a time, cut a publish
  from 15–25 s to about 4–6 s without touching the database.
tags: performance, latency, gateway, round-trip, n-plus-one, orchestration, batch, concurrency
applies-to: |
  Any user action that the browser drives as a sequence of API calls (multi-
  step wizards, approval or checkout protocols, batch actions that loop over
  items), especially when the API sits behind a gateway far from the users
  (cross-border, VPN, edge proxies).
related-rules:
  - prepare-off-to-the-side-flip-one-flag
historical-incidents:
  - channel 2026-10-08 — publishing one product took 15–25 s and batch publish ran one product at a time; an earlier explanation blamed per-action validation and a missing SDK batch update; the owner — "I don't quite buy it"
  - channel 2026-10-08 — measured — the function itself ran 28–52 ms (header x-cloudbase-upstream-timecost) while each request cost 0.6–3 s end to end; a no-auth health call paid the same, so the token check was not the cost; a publish made 8–9 requests in a row (fixed 13d6392 — one-request approval and BATCH_CONCURRENCY = 4)
---

## Symptom

An action that does little work feels slow (seconds per item), and gets
proportionally slower in batches. Explanations focus on the backend's
validation or a missing bulk API.

## Wrong mental model

"The SDK has no batch update and validates every action, so each item is
inherently slow." It sounds plausible because the backend does run checks per
step. But it was never measured, and it confuses *work* with *waiting*.

## How we found out

1. **Split server time from end-to-end time.** The gateway reported the
   function's own time in a response header: 28–52 ms. The browser saw
   0.6–3 s per request.
2. **Rule out auth.** A health call with no token cost the same, so the time
   was the gateway (in mainland China, reached from outside it), not the
   token check.
3. **Count the requests in the chain.** One publish = capabilities, get,
   prepare, review, begin, page, finish, publish: 8–9 requests, each waiting
   for the one before. 9 × ~1.5 s ≈ the observed 15 s.
4. **Check the batch loop.** Batch publish awaited each product before the
   next.

## Options considered

1. **Bulk database API.** Would not help: the database time was already tiny.
2. **Cache or skip validation.** Unsafe, and not where the time went.
3. **Move the chain server-side: one request runs prepare → review → begin →
   pages → finish, with a time budget and a hand-back.** Chosen, plus
   bounded concurrency for batches.

## Incorrect

```typescript
// ❌ The browser drives every step; each await is a full gateway round trip.
async function approveProduct(id: string) {
  await call('catalogDetailCapabilities');
  const product = await call('get', { id });
  await prepareAllPages(id);                 // 1+ requests
  const review = await call('review', { id });
  const job = await call('begin', { id, digest: review.digest });
  for (const page of pages(review)) await call('page', { job, page });
  await call('finish', { job });
}

// ❌ Batch: one product at a time.
for (const id of ids) results.push(await updateRecord(id, { published: true }));
```

## Correct

```typescript
// ✅ Server: the same steps and checks, in one request, inside a time budget.
export async function approveInOneRequest(actorId, input, deps, budgetMs = 12_000) {
  const deadline = deps.now() + budgetMs;          // function timeout is 20 s
  const handOver = (reason: 'media-import' | 'time-budget') =>
    ({ ok: true, status: 'needs-browser', reason }) as const;
  // 1. prepare every page (resumable)  → if out of time: handOver('time-budget')
  // 2. review; photos to import first   → handOver('media-import')
  // 3. begin, pages, finish             → { ok: true, status: 'approved' }
}

// ✅ Browser: one call; fall back to the step protocol under the SAME operation
//    id, which resumes the same server job instead of starting another.
export async function approveProduct(productId: string) {
  const operationId = crypto.randomUUID();
  const result = await call('catalogDetailApproval', { action: 'approve', productId, operationId });
  if (result.status === 'approved') return;
  const review = await prepareDetailReview(productId);
  await approveDetailReview(review, operationId);
}
```

```typescript
// ✅ Batch: a few products at once, results in selection order, and stop
//    starting new ones after an uncertain result or a refused session.
const BATCH_CONCURRENCY = 4;
let stopped = false;
let next = 0;
const worker = async () => {
  while (next < ids.length) {
    const index = next++;
    if (stopped) { outcomes[index] = notAttempted(ids[index]); continue; }
    try { outcomes[index] = { item: await updateRecord(ids[index], values) }; }
    catch (error) {
      if (!isDefiniteRejection(error) || isAuthError(error)) stopped = true; // may have committed
      outcomes[index] = { failure: describe(error) };
    }
  }
};
await Promise.all(Array.from({ length: BATCH_CONCURRENCY }, worker));
```

Why the details matter:

- **Same steps, same checks, same order.** The one-request path calls the
  step functions the browser called; it must not become a second, looser
  implementation.
- **Budget below the platform timeout,** and a hand-back that loses nothing:
  every step is idempotent under the operation id.
- **Concurrency is bounded and conservative.** An uncertain result (network
  error after a possible commit) stops new work instead of retrying.
- **Shared resources need the store's conflict handling** (two products
  sharing a photo): CloudBase re-runs a conflicting transaction; a lock
  collision answers "busy" and works on retry.

## Tests

```typescript
it('runs prepare → review → begin → pages → finish in one request, same order as the browser', /* … */);
it('hands back for photo imports and for time, and the browser resumes the same job', /* … */);
it('batch runs four at once and keeps selection order', /* … */);
it('after an uncertain result no new product starts; running ones report their own outcome', /* … */);
```

## Pattern name and triggers

**"Count the round trips."** Triggers: *slow, latency, seconds per item,
batch is slow, gateway, cross-border, "the SDK can't", N+1 requests,
multi-step protocol driven by the client.*

## Still uncertain

- Two approval paths now exist (one request, plus the browser fallback). If
  the fallback almost never runs, it drifts untested; measure how often it
  runs and delete it if never.
- Concurrency 4 was chosen, not measured against gateway rate limits.
