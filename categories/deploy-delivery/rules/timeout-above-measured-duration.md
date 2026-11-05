# Set a deploy step's timeout from its measured duration, and say when it fired

**Category**: deploy-delivery
**First seen**: 2026-11-04 in `channel` (Deploy Test 41850270700 attempt 1 → fix `3f1851cc`)
**Risk**: P1 — a half-applied deploy that looks like a provider outage

## The Lesson

One function's code ZIP was ~9 MB because it ships a native image library. Uploading
it from a US GitHub runner to an ap-shanghai bucket took 3 min 51 s and 4 min 40 s on
the two runs that succeeded. The step allowed 300 s with a single attempt. The third
run crossed the line after two other functions had already been updated, so the
deploy stopped half-applied.

The error said only `Private function ZIP upload failed (storage SDK)`. Every detail
had been dropped on purpose, because the upload result can contain a signed URL. So
the log could not distinguish "timed out at the limit" from "rejected in 2 s", and the
first guess was a Tencent problem.

## Why It Happens

A limit gets picked once, from a fast local run or a round number. Later the payload
grows (a native dependency here) or the network path changes (a cross-border runner),
and the margin disappears without anyone noticing. Redacting secrets from errors is
right, but it often removes the timing too, and timing is the one safe clue.

## The Fix

- Read the step's real durations from recent successful runs (log timestamps around
  the call) before choosing a number. Set the limit to at least 2× the slowest
  success, and note in a comment where the figure came from.
- Keep secrets out of the error, but always include elapsed time and the limit:

```js
const started = Date.now();
try {
  upload();
} catch {
  // Results can include signed URLs; elapsed time is safe and tells timeout from rejection.
  const seconds = Math.round((Date.now() - started) / 1000);
  throw new Error(`Upload failed (after ${seconds}s of ${LIMIT_MS / 1000}s)`);
}
```

- Before a rerun, check whether the same step's duration is creeping toward its
  limit. If it is, change the limit, not the luck.

## Examples

- 2026-11-04 (`channel`): limit 300 s → 600 s with an elapsed/limit message. The next
  run uploaded the same ZIP in 35 s. Cross-border throughput varies that widely,
  which is exactly why the limit needs headroom.
