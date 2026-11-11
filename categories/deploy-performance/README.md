# Deploy Performance (making a correct pipeline fast without weakening it)

**When this category bites**: the pipeline is correct but takes an hour, so people batch
changes, skip deploys, or "speed it up" by deleting the checks that make rollback
possible. A faster pipeline is only a win if every recovery guarantee still holds.

**Source project**: channel (2026-11-05/06) — a CloudBase deploy from US GitHub runners
to ap-shanghai. The deploy job went from 79 to 15 minutes, and a 533-page site delivery
from 43.7 to 24.5 minutes, with the same journal, backups and A/B recovery, by finding
where the wall time went first.

## The bedrock rule

**Time the real run, split each slow step into its parts, and remove waiting —
never a check. Every skip needs an exact proof, and anything less than proof
falls back to the old path.**

## Rules

| Rule | One-line | Status |
|---|---|---|
| [time-the-real-run-first](rules/time-the-real-run-first.md) | Read step timestamps and per-call logs from the last real run before choosing a lever | verified |
| [per-connection-vs-link-throughput](rules/per-connection-vs-link-throughput.md) | Slow uploads on a long link: add parallel streams until the link cap, not until "it feels faster" | verified |
| [reread-only-after-write](rules/reread-only-after-write.md) | A "verify" read after zero writes repeats the first read — skip it, keep it after writes | verified |
| [bounded-concurrency-for-independent-checks](rules/bounded-concurrency-for-independent-checks.md) | Independent idempotent checks run N at a time; stop scheduling on failure, drain in-flight work | verified |
| [skip-unchanged-by-exact-proof](rules/skip-unchanged-by-exact-proof.md) | Skip an upload only when the running artifact is byte-equal after normalizing the stamp; any doubt uploads | verified |
| [keep-the-recovery-unit-when-raising-parallelism](rules/keep-the-recovery-unit-when-raising-parallelism.md) | More concurrency inside a journaled step is safe only if the step stays the unit of unknown outcome | verified |
| [bounded-wait-for-eventual-consistency](rules/bounded-wait-for-eventual-consistency.md) | "Deleted" is not "unlisted": resend a refused delete while it is still listed, wait to a stated bound | verified |
| [gate-the-first-write-not-the-preparation](rules/gate-the-first-write-not-the-preparation.md) | Read-only preparation can run beside CI; only the first mutation must wait for green | verified |
| [remeasure-after-each-lever](rules/remeasure-after-each-lever.md) | After every change, break the time down again: the slowest part moves | verified |
| [serial-ci-jobs-need-a-data-dependency](rules/serial-ci-jobs-need-a-data-dependency.md) | A `needs:` that carries nothing only adds the jobs' times together; gate at the join | draft |
| [measure-your-change-from-the-deployed-base](rules/measure-your-change-from-the-deployed-base.md) | Branch a measured change from what is deployed; a release head ships others' work too | draft |
| [ci-fan-out-stays-under-the-runner-limit](rules/ci-fan-out-stays-under-the-runner-limit.md) | More parallel jobs help only below the account's concurrent-runner limit; another run's jobs share it | draft |

## Cross-links

- `deploy-delivery` owns pipeline correctness (causal gating, owned services, secrets);
  this category must never trade any of those for speed.
- `verification-integrity` — a skipped step is a dated decision with a proof, not a default.
- Stack-specific measurements (SDK internals, gateway latency, regional link speed) live in
  the stack's own skill, not here.

*Last updated: 2026-11-11 (round 2: re-measuring, CI job edges, measuring from the deployed base).*
