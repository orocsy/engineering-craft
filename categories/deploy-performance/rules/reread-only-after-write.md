# A verification read is only meaningful after a write

**Category**: deploy-performance
**First seen**: 2026-11-05 in `channel` (#74)
**Risk**: P2 — doubles the cost of every idempotent "ensure" step

## The Lesson

An ensure-resource loop read existence, indexes and permission, wrote what was missing,
then read all three again "to verify" — also when it had written nothing. With nothing
written, the second read only repeats the first, seconds later, and proves nothing new:
any drift was already a hard stop on the first read. Keep the re-read for collections
that actually changed.

## Why It Happens

"Write, then read back" is a good habit, copied without the condition that makes it
meaningful.

## The Fix

```js
let changed = false;
// ...first reads; on any create/update set changed = true...
if (changed) {
  // re-read and verify exactly as before
}
```

Pin both halves in tests: an unchanged resource costs exactly the first reads; a
changed one is still read again.

## Examples

- 2026-11-05 (`channel` #74) — 198 → 99 tool calls for 33 all-ready collections.
