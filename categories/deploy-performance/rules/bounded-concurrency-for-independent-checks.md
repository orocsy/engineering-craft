# Run independent checks N at a time; on failure start nothing new and drain

**Category**: deploy-performance
**First seen**: 2026-11-05 in `channel` (#73, #74)
**Risk**: P1 — unbounded or careless concurrency turns one failure into many half-done writes

## The Lesson

Checks on independent resources (one collection, one file readback) can overlap. Three
details keep that safe: a fixed bound, refusing duplicates (two workers must never
touch the same resource), and on the first failure no new item starts while items
already running finish before the first error is thrown. Share one implementation
between the sequential and concurrent entry points so the checking logic exists once.

## Why It Happens

`Promise.all(items.map(...))` is one line, has no bound, and rejects while siblings are
still writing.

## The Fix

```js
let next = 0, failed = false, failure;
await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
  while (!failed && next < items.length) {
    const item = items[next++];
    try { await check(item); } catch (error) { if (!failed) failure = error; failed = true; }
  }
}));
if (failed) throw failure;
```

A generator that yields each request lets a synchronous and an asynchronous driver
run the same steps.

## Examples

- 2026-11-05 (`channel` #74) — collection checks 4 at a time after a sequential warm-up
  call (so the tool cache is filled before parallel `npx` runs).
