# A rerun must not store a second "before" backup under the original's name

**Category**: deploy-delivery
**First seen**: 2026-11-05 in `channel` (Deploy Test 41850270700 attempt 2 → PR #77)
**Risk**: P1 — the rollback artifact restores the half-new state

## The Lesson

The deploy job captured every function's code as `function-backup-before-<sha>-<run_id>`
and then updated the functions one by one. Attempt 1 updated two of three and failed.
"Re-run failed jobs" ran the whole job again: it captured the backup again, this time
holding the two already-updated functions, and uploaded it under the same name.
Now two artifacts carry the "before" name, and the newer one is not "before" at all.
A restore that picks by name, or picks the latest, rolls back to the half-new code.

## Why It Happens

GitHub keeps `run_id` across reruns and increments only `run_attempt`. A step written
as "capture state, then mutate" is correct on the first attempt. On any later
attempt it captures whatever the earlier attempt left behind.

## The Fix

- Put `${{ github.run_attempt }}` in the name of every backup that a job captures
  right before it mutates, and say in the runbook to restore from attempt 1.
- Do not add the attempt to an artifact a reused job uploads once and a later job
  downloads by name. A rerun of only the failed job keeps the earlier successful
  job's artifact, so a name with the new attempt would not exist. Protect that kind
  of backup by re-verifying it against the live state before the first write instead.
- Better still: record the first attempt's backup as the release's rollback point
  (in the delivery doc or a release note), so nobody has to work out which one it is.

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: function-backup-before-${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}
```

## Examples

- 2026-11-05 (`channel` #77): function backup gained `run_attempt`; the hosting backup,
  taken once in a `prepare` job and re-checked against the live site before writing,
  kept its name.
