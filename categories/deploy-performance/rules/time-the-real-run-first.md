# Read the last real run's timings before choosing a lever

**Category**: deploy-performance
**First seen**: 2026-11-05 in `channel` (Deploy Test 41850270700 → PRs #73–#75)
**Risk**: P2 — optimizing the step you suspect instead of the one that costs the time

## The Lesson

The brief said the uploads were slow because each SDK call recreated its client. The
log said otherwise: the per-file SDK setup was 0.3–0.5 s, the PUT itself 4–5 s. The
second-biggest cost, 11.5 minutes, was in a step nobody had mentioned: 40 collection
checks of ~17 s each, all already ready. Step timestamps plus per-call log lines turn
"deploy is slow" into a ranked list in minutes.

## Why It Happens

Deploy logs are long and noisy, so people reason from the code instead. But wall time
lives in network round trips and retries that the code does not show.

## The Fix

```bash
# Step durations of one job
gh api repos/OWNER/REPO/actions/jobs/JOB_ID \
  --jq '.steps[] | "\(.started_at[11:19])-\(.completed_at[11:19]) \(.name)"'
# Per-call costs inside a step: sum elapsedMs by method, count calls per unit of work
gh run view --repo OWNER/REPO --job JOB_ID --log > job.log
```

Then, for the top two steps, write down: calls per item × seconds per call × items.
That product names the lever (fewer calls, cheaper calls, or concurrent calls).

## Examples

- 2026-11-05 (`channel` #74) — 6 sequential tool spawns per collection × ~2.9 s × 40
  collections = 11.5 min; halving the calls and running 4 at once measured 1.4 min.
