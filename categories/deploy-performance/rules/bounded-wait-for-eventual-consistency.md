# "Deleted" is not "unlisted": resend a refused delete, wait to a stated bound

**Category**: deploy-performance
**First seen**: 2026-11-04 in `channel` (Deploy Test 41878896329 → #74, #82)
**Risk**: P2 — a green deploy reported red, and the next one inherits a scare

## The Lesson

A deploy accepted and committed the site, then failed in clean-up: after deleting a
temporary cloud function, six list checks over ~8 s still showed it. The first fix only
waited longer (~1 minute), and two later deploys failed the same way. The receipt then
showed the real cause: the delete call itself was refused (`FailedOperation.DeleteFunction`)
four times after the function's last use and accepted on the fifth, but its error had been
swallowed, and the client stopped checking right after that last attempt. Waiting can
never succeed after a refused delete; only another delete can.

## Why It Happens

"Delete, then poll until gone" assumes the delete was accepted. Errors from the delete are
swallowed because the poll is meant to be the proof, and backoff windows are picked from a
local test where deletion is instant.

## The Fix

- Never swallow the operation's error and only wait. While the target is still listed,
  resend the (idempotent, exactly-scoped) operation every few checks.
- Never resend on the last checks: leave room to observe an operation accepted late.
- Record attempts and error codes (never messages) in the evidence the job already keeps;
  the next failure then explains itself.
- Keep a stated bound (here ~2 minutes) and keep "still listed after the bound" as
  unconfirmed, not "assume gone".

## Examples

- 2026-11-05 (`channel` #74) — wait-only, 16 checks over 57.75 s; failed again on 11-11.
- 2026-11-11 (`channel` #82) — resend every second check, never on the last four, ~118 s.
  The next run's first delete was refused and the resend worked; clean-up took 7 s in the
  other step.
