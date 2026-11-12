# A deadline must start when the work starts, and be tested against the real limit

**Category**: deploy-performance
**First seen**: 2026-11-12 in `channel` (#88, #89)
**Risk**: P1 — raising concurrency above a hidden queue turns a speed-up into timeouts that pass on a fast day and fail on a slow one

## The Lesson

A speed change sent up to 8 uploads at once to a storage client that ran one file at a
time and queued the rest. Every upload's 60 s deadline started when it was handed over,
so on a slow day queued uploads expired before they began, and the deploy failed. Two
earlier deploys had passed only because the link drained the queue in time. The fix for
that (deadlines that grow with object size) then exceeded the transfer layer's 300 s
maximum, which the unit tests could not see: they used a fake transport without that guard.

## Why It Happens

Concurrency is added at one layer while a queue or limit lives in the layer below, and the
deadline is measured from the caller's side. Fakes model the happy path of the layer they
replace, not its guards.

## The Fix

- Find every queue under a deadline (SDK file/part limits, connection pools) and set it
  at least as wide as the concurrency you hand it; or start the clock when work starts.
- Read the stage log before blaming the network: `task-ready` long before
  `task-started` means queued, not slow.
- Test any change to deadlines, limits or concurrency through the real lower layer (a
  local server is enough); fakes do not carry its guards.
- Before a delivery-path change reaches a shared environment, dry-run it through the
  real chain on the real payload.

## Examples

- 2026-11-12 (`channel` #88, #89) — runs 43212545234 and 43217655741 failed before any
  site write. After both fixes, run 43221879924 passed on a ~56 KB/s link: 33 objects,
  33.5 MB, slowest 147 s within the 300 s limit.
