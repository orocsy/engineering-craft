# Gate the first write on CI, not the read-only preparation

**Category**: deploy-performance
**First seen**: 2026-11-06 in `channel` (#76)
**Risk**: P1 — done wrong, it becomes a deploy that is a sibling of CI

## The Lesson

After the first speed-ups, about 10 minutes of the deploy job were read-only
preparation — product snapshot, site build, a full download of the live site for
backup — and all of it waited for a 10-minute CI. None of it changes anything. Only
the first mutation must be a causal descendant of green CI.

Check each step's calls before calling it preparation. In `channel` the product
snapshot looked like a read, but it took the release lease and created a temporary
cloud function from the commit's code: a write by untested code. It stayed after CI,
and the saving shrank from an estimated 10 minutes to about 5.

## Why It Happens

"Deploy needs CI" is applied to the whole job because the job is the unit of
`needs:`.

## The Fix

Split the job: a `prepare` job without `needs: ci` that only reads and uploads its
results as artifacts, and a `deploy` job with `needs: [ci, prepare]` that performs
every write. A backup taken during CI may be stale by the time writing starts: re-check
the live inventory against it immediately before the first write and stop on any
difference.

Pin the preparation job to an allowlist of commands in a contract test, so a write
cannot be added to it unnoticed.

## Examples

- 2026-11-06 (`channel` #76) — hosted-site backup and contract tests moved beside CI;
  the deploy job re-checks inventory and configuration before its first write.
  The next run took 27.9 min instead of 37–40; the deploy job 15 min instead of 26.7.
  The backup job finished inside CI, and the pre-write check took 8 s.
