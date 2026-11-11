# Raise concurrency inside a journaled step only if the step stays the recovery unit

**Category**: deploy-performance
**First seen**: 2026-11-05 in `channel` (#73)
**Risk**: P1 — a "faster" write path that recovery can no longer reason about

## The Lesson

The site delivery journals each batch of 12 files (paths, hashes and before-hashes)
before any write, and treats a lost acknowledgement as "the whole batch is unknown".
Moving from 4 to 12 concurrent uploads inside a batch changed one thing: on a mid-batch
failure up to 12 files instead of 4 may be written. Recovery already reads back and
restores every journaled member, so the guarantee is unchanged. Growing the batch
itself (24, 48) would have changed the unit, the content-lock window and the size of
the confirming transaction — a different, reviewable decision.

## Why It Happens

Parallelism and batch size look like the same knob; only one of them is the unit that
the journal, locks and recovery are built around.

## The Fix

Before raising concurrency, write down the recovery unit and check that nothing can be
written outside it. Bind the new setting into the plan's identity so old journaled
plans keep their reviewed behaviour, and refuse a plan the executor cannot honour
before writing any intent.

## Examples

- 2026-11-05 (`channel` #73) — `delivery.uploadParallel = 12` bound into the plan hash;
  plans without it keep the four-way path.
