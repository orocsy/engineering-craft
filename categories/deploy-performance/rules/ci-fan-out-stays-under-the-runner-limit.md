# Splitting CI into more jobs only helps below the runner concurrency limit

**Category**: deploy-performance
**First seen**: 2026-11-11 in `channel` (Deploy Test 42961041147)
**Risk**: P2 — a faster CI layout that queues and ends up slower

## The Lesson

Splitting the two slowest CI jobs raised one deploy run to ~19 parallel jobs. GitHub's
free plan runs about 20 at once per account. Two pushes to the pull-request branch during
the deploy started a second CI run, and jobs of the deploy run waited up to 5 minutes for
a runner: the run took longer than before the split.

## Why It Happens

Each job's time looks shorter on its own; the queue is invisible until jobs from two runs
share the account's runners.

## The Fix

- Count the jobs a run starts at once (matrix entries included) and keep the count below
  the plan's limit, leaving room for other workflows that run at the same time.
- Split by measured time, not by count: two balanced shards beat four uneven ones.
- Do not push to branches that start CI while a measured deploy is running; compare job
  start times with the run's start before reading any timing.

## Examples

- 2026-11-11 (`channel`) — job start times in the run spread from 04:43 to 04:48 while a
  pull-request CI run for the same branch was active.
