---
title: Failure Classes, Resumable Retries and Time Budgets for Long Jobs
type: pattern
maturity: verified
last-referenced: 2026-10-12
impact: HIGH
impact-description: |
  A long job that fetches from an outside source (photos, API pages, files)
  runs in short calls (serverless time limits) and must resume, retry and give
  up correctly. Treating every failure the same either retries the
  impossible forever, gives up on the transient, or blames the source for our
  own outage. A retry that ignores its own fresh failure notes loops; a time
  budget that only counts one kind of progress never trips.
tags: retry, backoff, resumable, cursor, idempotent, time-budget, serverless, failure-classification
applies-to: |
  Background or admin-triggered jobs that call an outside source item by item,
  run in time-limited calls with a cursor, record failures between calls, or
  offer a manual "try again" button.
related-rules:
  - prepare-off-to-the-side-flip-one-flag
  - race-test-contract
historical-incidents:
  - channel 2026-10-09 — first photo job noted every failure "for a day", so 7 photos (including ones Alibaba had deleted) kept their drafts incomplete; the owner — "a day is too long to wait"
  - channel 2026-10-09 — a call where nothing needed downloading never counted progress, so the 12 s budget never stopped it; one call ran about 4 minutes (fixed 78a4c47)
  - channel 2026-10-09 — manual "Copy photos now" ignored ALL failure notes, including those written earlier in the same run, so a product with a slow photo resumed, refetched it, timed out again — looping for hours (review P2, fixed 37d421e)
  - channel 2026-10-09 — our own storage failures (`write-failed`) counted toward the 6-try give-up, so a storage outage could permanently drop good photos (review P3, fixed 8cca888)
  - channel 2026-10-09 — Alibaba answered 403 for photos it had taken down; treated as passing, a new draft would have waited through six retries (fixed 288b6f5)
---

## Symptom

Some items never finish ("still waiting"), some are given up too early, a
manual retry button runs for hours, or a call blows through its time limit.
Counts like "7 failed" stop shrinking from one run to the next.

## Wrong mental model

"A failure is a failure: note it, retry it after a while." And: "a manual
retry should ignore what we know and try everything again." Both treat the
failure note as an annoyance instead of the job's memory, and both ignore
**who** failed (the source, the network, or us).

## How we found out

- Fetching each failing address by hand: one returned 404 (deleted), two 403
  on every host and size (blocked), four 200 but were animated GIFs our
  storage did not accept. Three different classes behind one "failed" count.
- A scratch test from the reviewer: five photos, the first hanging for 15 s,
  12 s budget. With "ignore all notes", five calls in a row returned the same
  cursor and fetched the same photo.
- The 4-minute call: the budget only counted downloads as progress, and a
  page where every photo was already copied downloaded nothing.

## Incorrect

```typescript
// ❌ One class of failure; a manual retry ignores every note, even fresh ones.
async function copiedState(url: string, retryUnavailable: boolean) {
  const link = await getLink(url);
  if (link?.imageId) return { state: { imageId: link.imageId } };
  if (retryUnavailable) return { state: null };          // refetch — even if it failed 5 s ago
  if (link?.failedAt && Date.now() - Date.parse(link.failedAt) < ONE_DAY)
    return { state: 'failed' };                            // 404 and timeout treated alike
  return { state: null };
}

// ❌ Budget trips only after a download, so an all-cached page never stops.
const budget = { outOfTime: () => downloaded && clock() - start >= BUDGET_MS };
```

## Correct

```typescript
// ✅ Three classes. Retrying cannot fix a permanent one; a passing one waits a
//    short, fixed time; a failure on OUR side never counts against the photo.
const PERMANENT = new Set(['invalid-url', 'host-not-allowed', 'too-many-redirects',
                           'not-found' /* 403, 404, 410 */, 'too-large', 'bad-content']);
const RETRY_AFTER_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 6;

async function copiedState(url: string, nowMs: number, retryBeforeMs: number | null) {
  const link = await getLink(url);
  if (link?.imageId && (await isActive(link.imageId))) return { state: { imageId: link.imageId } };
  const failedAt = Date.parse(link?.failedAt ?? '');
  if (!Number.isFinite(failedAt)) return { state: null, attempts: 0 };
  const attempts = link.failureAttempts ?? 1;
  // Manual retry: only failures recorded BEFORE this run started, count kept.
  if (retryBeforeMs !== null && failedAt < retryBeforeMs) return { state: null, attempts };
  if (PERMANENT.has(link.failureReason) || attempts >= MAX_ATTEMPTS) return { state: 'unusable' };
  return { state: nowMs - failedAt < RETRY_AFTER_MS ? 'waiting' : null, attempts };
}

// After a failed fetch:
const attempts = reason === 'write-failed' ? known.attempts : known.attempts + 1;
```

```typescript
// ✅ The run's cutoff comes from the SERVER clock on its first call and is
//    echoed back; the client passes it to every later call of the same run.
const retryFailedBefore = input.retryFailedBefore ?? (input.retryUnavailable ? now() : undefined);
// ...page result includes { retryFailedBefore } so the browser can pass it on.
```

```typescript
// ✅ Any finished unit is progress, so every call ends at its budget.
const budget = {
  outOfTime: () => worked && clock() - startedAt >= budgetMs,
  worked: () => { worked = true; },
};
// call budget.worked() after a batch that tried a download AND after each finished record
```

Rules:

- **Classify at the source of the error**, not at the retry site: map HTTP
  status and content checks to a reason (`not-found`, `bad-content`,
  `fetch-failed`, `write-failed`) where the fetch happens.
- **Probe before deciding a status is permanent.** 403 looked transient; the
  same 403 on every CDN host and size, while a wrong extension gave 404,
  showed the file existed but was blocked.
- **Resume at a unit boundary.** A call that runs out of time returns the
  cursor of the last finished record; the unfinished record restarts, reusing
  whatever it already copied.
- **A manual retry is a run with a start time**, not "forget everything".
- **Never count your own outage against the source.**

## Tests

```typescript
it('a passing failure waits 10 minutes, then the whole record lands', /* … */);
it('a photo the source no longer has is skipped and does not block the record', /* … */);
it('six passing failures give up, so the record can appear', /* … */);
it('our storage failing never counts toward giving a photo up', async () => {
  // 8 runs 11 minutes apart, importer always 'write-failed' → still 'waiting', never 'unusable'
});
it('a manual retry never fetches the same slow photo twice in one run', async () => {
  // first call: retryUnavailable → photo hangs 15 s, budget 12 s → out of time, cutoff echoed
  // second call with retryFailedBefore → the fresh note counts → 'waiting', run done
  assert.equal(calls.filter((u) => u === slow).length, 1);
});
it('a call stops at its time limit even when nothing needs downloading', /* … */);
```

## Pattern name and triggers

**"Classify, remember, resume at a boundary."** Triggers: *retry, backoff,
give up, failure note, cursor, resumable, time budget, function timeout,
"Copy now" / "Try again" button, 403, 404, flaky source, stuck job.*

## Still uncertain

- A throttling 403 from the source would now skip a good photo. The manual
  retry recovers it; watch skipped counts.
- `MAX_ATTEMPTS = 6` with a 10-minute wait assumes someone runs the job
  regularly; without a scheduler, six tries can take days.
