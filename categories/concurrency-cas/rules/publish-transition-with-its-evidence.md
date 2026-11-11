---
title: Publish a Transition and the Evidence Readers Use to Judge It in One Transaction
last-referenced: 2026-11-12
maturity: verified
type: pattern
impact: HIGH
impact-description: |
  A refresh-token grace window forgave a losing browser tab only if a live sibling
  token existed (the sibling proved a legitimate rotation had just happened). Rotation
  was two separate commits: revoke the old token, then insert the new one. A tab whose
  check landed between them saw no live sibling, judged the request a theft, revoked
  the whole session family, and signed an innocent user out. It passed every fast local
  run and failed only on a slow CI runner.
tags: transaction, evidence, rotation, refresh-token, two-commit, race, concurrency
applies-to: |
  Any decision that reads state as EVIDENCE that some transition legitimately happened:
  a live sibling token proves a rotation, an intent row proves a refund is owed, a marker
  row proves compensation already ran.
related-rules:
  - single-use-token-consumption
  - cross-tx-cas-recompute
  - tx-rollback-contract-layers
historical-incidents:
  - a real incident (July 2026): token rotation committed revoke and insert separately; a concurrent tab saw zero live tokens in the gap and the theft check revoked a legitimate session
---

## The lesson

When a reader decides between "legitimate" and "suspicious" by looking for evidence, the
transition and its evidence must become visible together. If the evidence lands in a later
commit, every reader between the two commits sees a half-state and takes the wrong branch.
Fast machines almost never expose the gap, so tests stay green until a slow runner or real
traffic hits it.

## Why it happens

Each write looks correct on its own, and the second write "follows immediately". But
"immediately" is a network round trip, and another request can read in between.

## The fix

```ts
// ❌ Wrong: two commits; a reader between them sees neither token alive
await prisma.refreshToken.updateMany({ where: { id: oldId, revokedAt: null }, data: { revokedAt: now } });
await prisma.refreshToken.create({ data: next });

// ✅ Right: the new token (the evidence) and the revoke publish atomically
await prisma.$transaction([
  prisma.refreshToken.updateMany({ where: { id: oldId, revokedAt: null }, data: { revokedAt: now } }),
  prisma.refreshToken.create({ data: next }),
]);
```

## Test

Pause between the two writes in a test double (or run the reader under a barrier) and
assert the reader's verdict is still "legitimate". A test that never interleaves can't
catch this.
