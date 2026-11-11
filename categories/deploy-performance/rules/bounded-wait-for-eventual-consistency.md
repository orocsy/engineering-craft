# "Deleted" is not "unlisted": wait to a stated bound before calling it unconfirmed

**Category**: deploy-performance
**First seen**: 2026-11-04 in `channel` (Deploy Test 41878896329 → #74)
**Risk**: P2 — a green deploy reported red, and the next one inherits a scare

## The Lesson

A deploy accepted and committed the site, then failed in clean-up: after deleting a
temporary cloud function, six list checks over ~8 s still showed it. Control planes
propagate deletes asynchronously; the check was right to refuse to guess, but its
window was shorter than the platform's normal delay.

## Why It Happens

Backoff windows are picked from a local test where deletion is instant.

## The Fix

Poll a complete listing with exponential backoff to a cap (e.g. 0.25 s → 5 s, ~1 minute
total), share one helper between every client that cleans up, and keep the original
behaviour after the bound: still listed means unconfirmed, not "assume gone".

## Examples

- 2026-11-05 (`channel` #74) — 16 checks, 57.75 s in all; the next deploy's clean-up
  finished well inside it.
