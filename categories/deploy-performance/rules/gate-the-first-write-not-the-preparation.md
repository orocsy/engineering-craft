# Gate the first write on CI, not the read-only preparation

**Category**: deploy-performance
**First seen**: 2026-11-05 in `channel` (proposal; not yet implemented)
**Risk**: P1 — done wrong, it becomes a deploy that is a sibling of CI

## The Lesson

After the first speed-ups, about 10 minutes of the deploy job were read-only
preparation — product snapshot, site build, a full download of the live site for
backup — and all of it waited for a 10-minute CI. None of it changes anything. Only
the first mutation must be a causal descendant of green CI.

## Why It Happens

"Deploy needs CI" is applied to the whole job because the job is the unit of
`needs:`.

## The Fix

Split the job: a `prepare` job without `needs: ci` that only reads and uploads its
results as artifacts, and a `deploy` job with `needs: [ci, prepare]` that performs
every write. A backup taken during CI may be stale by the time writing starts: re-check
the live inventory against it immediately before the first write and stop on any
difference.

## Examples

- 2026-11-05 (`channel`) — estimated saving ~10 min of a 37-min run; listed as the top
  next step, not yet measured.
