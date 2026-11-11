# Parallelize a long-link upload up to the link cap — and measure the cap

**Category**: deploy-performance
**First seen**: 2026-11-05 in `channel` (#73)
**Risk**: P2 — wrong concurrency in either direction wastes most of the step

## The Lesson

Across a lossy long link (US runner → mainland China object storage), each connection
ran at ~22–40 KB/s, but the link as a whole carried ~350 KB/s whether 8 or 32
connections were used. Four-way uploads therefore used about a quarter of the link;
going from 8 to 32 parts on a large archive bought nothing. The useful number is the
aggregate cap, found by comparing two existing runs at different concurrency.

## Why It Happens

Per-request time is easy to see and gets blamed on setup cost; aggregate throughput
needs two measurements and is rarely taken.

## The Fix

- Compute bytes ÷ seconds for one stream and for the whole step at two concurrency levels.
- Raise concurrency until throughput stops rising; stop there.
- If the cap itself is the problem, no client change helps: move the work next to the
  target (see `gate-the-first-write-not-the-preparation` for the related layout idea).
- When several objects upload at once, budget the parts in flight across all of them,
  near the count that reached the cap. Each multipart part keeps its own deadline; three
  videos sent as 40 parallel parts would leave each at a few KB/s, past that deadline.

## Examples

- 2026-11-05 (`channel` #73) — 12 files per journaled batch moved from 4-way to one
  12-way SDK call; 83 MB archives measured 325 KB/s at 8 parts and 364 KB/s at 32.
  Measured on a 533-page deploy (2026-11-09): median batch 37 → 20 s, upload window
  ~31 → 14.8 min.
- 2026-11-12 (`channel` #84) — 42 recovery objects (83 MB) with about 8 parts in flight
  moved at ~850 KB/s (98 s); the same bytes as one 32-part object took 143–255 s.
  Median object upload 5.3 s, longest 9.3 s, inside the 60 s part deadline.
