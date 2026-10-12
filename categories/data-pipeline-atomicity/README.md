# Data Pipeline Atomicity

**When this category bites**: a record built from several slow or fallible
external steps (photos, API pages, conversions) shows up half-done; a job
retries the impossible forever, gives up on the transient, or loops on its own
fresh failures; a call blows through its time limit because "progress" was
counted too narrowly.

**Source incidents**: channel catalog photo pipeline, 2026-10-09 (5 commits,
1 P1 and 2 P2 found in review).

## Bedrock rule

**When the store cannot hold one transaction across network calls, atomicity
comes from the shape of the writes: do every external step off to the side,
then make ONE guarded write that completes the record and flips its
visibility. Failures are classified by who failed (the source, the network,
us), remembered between calls, and retried from a unit boundary.**

## Rules

| Rule | Impact | Trigger |
|------|--------|---------|
| [prepare-off-to-the-side-flip-one-flag](rules/prepare-off-to-the-side-flip-one-flag.md) | HIGH | A job builds one user-visible record from several external fetches; "can't use a transaction"; half-ready records visible |
| [failure-classes-and-resumable-retries](rules/failure-classes-and-resumable-retries.md) | HIGH | Long job in time-limited calls with a cursor, failure notes, a manual "try again", or a time budget |

## Anti-patterns

- Saving whatever succeeded and "retrying the rest later" while the record is visible
- One retry policy for 404, timeouts and our own storage errors
- A manual retry that ignores every failure note, including ones from this run
- A time budget that only counts one kind of progress
- A hidden-until-ready flag with no path that clears it when the record changes state

## Related

- [historical-data-compatibility/optional-field-gates-the-record](../historical-data-compatibility/rules/optional-field-gates-the-record.md) — readers must not assume the new shape
- [concurrency-cas/race-test-contract](../concurrency-cas/rules/race-test-contract.md) — guarded writes need race tests
