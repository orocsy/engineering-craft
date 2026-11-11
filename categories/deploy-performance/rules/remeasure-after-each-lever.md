# The bottleneck moves: re-measure after every lever

**Category**: deploy-performance
**First seen**: 2026-11-09 in `channel` (Deploy Test 42582880958 → PR #82)
**Risk**: P2 — the next change targets a cost that is no longer the biggest

## The Lesson

Before the first change, a 12-file upload batch took ~37 s and the upload itself was
22 s of it. After uploads went 12-way, the same batch took ~20 s, and its parts were:
upload 6.7 s, after-write readback and confirmation 7.0 s, and checks plus before-write
readback 4.3 s. The public readbacks, untouched and still 4-way, now cost as much as the
upload. A plan written from the first measurement would have kept optimizing uploads.

## Why It Happens

The first breakdown becomes the mental model; later runs are only checked for "faster
or not", not for where the remaining time went.

## The Fix

After each lever lands, take the same breakdown again, per unit of work (per batch, per
item), from a run that exercised it. Rank again before choosing the next lever. Keep the
analysis as a script, so repeating it costs a minute.

## Examples

- 2026-11-11 (`channel` #82) — after the upload change, the 4-way readbacks, the product
  snapshot's 4-way public reads and a CI job waiting for an unrelated one were the
  largest remaining costs; none had been on the first list.
