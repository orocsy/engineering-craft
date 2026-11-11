# A `needs:` without a data dependency serializes the critical path

**Category**: deploy-performance
**First seen**: 2026-11-11 in `channel` (PR #82)
**Risk**: P2 — minutes on every run, invisible in any single job's time

## The Lesson

CI's build job had `needs: unit`, but it checked out, installed and built on its own; it
used nothing the unit jobs produced. So the slowest unit group (9.5 min) and the build
(4.4 min) ran one after the other on every deploy. The deploy already waited for the
whole CI workflow, so the ordering added time and no safety.

## Why It Happens

`needs:` reads like "only build if the tests pass", which feels prudent. But the gate
that matters is where the results join before release, not between two checks.

## The Fix

For each `needs:` edge, name what flows along it: an artifact, an output, or a result
that must block. If nothing does, drop the edge and gate at the join (the job or
reusable workflow the deploy depends on). Pin the gate, not the edge, in contract tests.

## Examples

- 2026-11-11 (`channel` #82) — on the PR run the build started with the unit jobs
  instead of 7 minutes later.
