---
title: The Atomic Gate Lives in the Storage Layer, Not in JS
impact: CRITICAL
impact-description: |
  Read-then-write across a network call is never atomic. JS-level checks reduce the race
  window but never close it. The gate must be in the storage primitive itself.
tags: concurrency, cas, redis, postgres, race-condition, toctou
applies-to: |
  Any code shaped like `const x = await read(); if (x.flag) throw; await update(x, ...)`.
related-rules:
  - state-machine-first
  - redis-lua-cas
  - postgres-optimistic-cas
  - single-use-token-consumption
historical-incidents:
  - PR#85 round 1 (link reset TOCTOU)
---

## Why this matters

Two requests with the same input arrive within milliseconds (browser double-submit, network
retry, ngrok-style rebroadcast, attacker replay). Both pass the JS-level check because
both ran their `read` before either ran their `update`. The result: double-spend,
double-consume, brute-force budget silently doubled, password silently overwritten.

The pattern fails IDENTICALLY across:
- `findUnique` → `update` (Prisma)
- `get` → `set` (Redis)
- `select` → `update` (raw SQL)
- `read` → `write` (any K/V store)

The fix is always the same: **the predicate that gates the write must be evaluated by the
storage layer at the moment of the write, not by JS at the moment of the read.**

## Incorrect (the pattern that bit PR#85 round 1)

```typescript
// ❌ Two concurrent /reset-password requests with the same jti.
// Both pass the consumedAt !== null check (read outside the storage CAS).
// Both call update. Each thinks it consumed exclusively.
// Two tokenVersion bumps. Second password write overwrites first.

const record = await tx.passwordResetToken.findUnique({ where: { jti } });
if (!record) throw new GoneException('Reset link not found');
if (record.consumedAt !== null) throw new GoneException('Already consumed');
if (record.expiresAt < new Date()) throw new GoneException('Expired');

await tx.passwordResetToken.update({
  where: { jti },
  data: { consumedAt: new Date() },
});
await tx.user.update({
  where: { id: record.userId },
  data: { passwordHash, tokenVersion: { increment: 1 } },
});
```

What's wrong line-by-line:
- L1-2 `findUnique` reads the row state at time T0.
- L3 `consumedAt !== null` check is evaluated at time T0 by Node, not by Postgres.
- L7-9 `update` runs at time T1 > T0. By T1, another caller may have already updated.
- The `update` doesn't predicate on `consumedAt: null` — it predicates only on `jti`.
- Postgres happily writes both updates. Race window: ~5ms in production. Plenty.

## Correct (PR#85 fix)

```typescript
// ✅ The gate IS the WHERE clause. Postgres takes the row lock, re-evaluates
// the predicate against the latest committed row, and only one transaction's
// updateMany returns count=1. The loser sees count=0 and aborts cleanly.

const result = await tx.passwordResetToken.updateMany({
  where: {
    jti,
    consumedAt: null,                  // ← gate IN the WHERE
    expiresAt: { gt: new Date() },     // ← also part of the gate
  },
  data: { consumedAt: new Date() },
});
if (result.count !== 1) {
  throw new GoneException('Already consumed or expired');
}

// Now read the userId for the next step (safe — we hold the row in this tx)
const record = await tx.passwordResetToken.findUnique({
  where: { jti },
  select: { userId: true },
});

// ... apply password update with its own CAS (see postgres-optimistic-cas.md)
```

What's right line-by-line:
- L4-7 `where` predicate is sent to Postgres. Postgres takes the row lock, re-evaluates
  the predicate against the latest committed value, and only one tx satisfies it.
- L8 `data: { consumedAt: new Date() }` is the mutation. Atomic with the WHERE
  evaluation by virtue of `UPDATE ... WHERE` being a single statement.
- L10 `result.count !== 1` is the CAS-loser branch. Loser saw the row but failed the
  predicate at lock time → count=0. Throws cleanly, no half-completed state.
- L13 second `findUnique` is safe because we now hold the row inside this tx — no
  concurrent updater can re-mutate.

## Why `updateMany` instead of `update`?

Prisma's `update({ where: { jti } })` requires `jti` to be unique AND the WHERE clause
to match exactly one row. If your CAS predicate is `jti AND consumedAt: null` and
nothing matches, `update` throws `RecordNotFound` — but that error is indistinguishable
from "row never existed" without further work. `updateMany` returns `{ count: 0 | 1 }`,
which gives you a clean signal.

A second reason: Prisma's `update` validates the WHERE at the application layer using
the unique index. `updateMany` accepts any combination of fields and pushes the entire
predicate to Postgres. CAS predicates are not unique-keyed, so `updateMany` is the right
shape.

## What about isolation levels?

Works correctly under READ COMMITTED — Postgres `UPDATE ... WHERE` re-evaluates the
predicate against the latest committed row at lock time, even if your earlier
`findUnique` (in the same tx) read a stale value. You do NOT need SERIALIZABLE for this
pattern.

For the booking flow's two-layer protection (Redis lock + serializable tx), see the
project's `apps/api/src/modules/booking/booking.service.ts` — that's a different pattern
because the predicate spans multiple rows and time ranges, not a single-row CAS.

## Tests that prove it

```typescript
it('two concurrent valid consumes with the same jti — only one succeeds', async () => {
  const jti = 'race-test-jti';
  await prisma.passwordResetToken.create({ data: { jti, userId, tenantId, expiresAt: future, consumedAt: null } });

  const [a, b] = await Promise.allSettled([
    service.resetPassword({ token: signJwt(jti), newPassword: 'A!' + rand() }),
    service.resetPassword({ token: signJwt(jti), newPassword: 'B!' + rand() }),
  ]);

  const fulfilled = [a, b].filter(r => r.status === 'fulfilled');
  const rejected  = [a, b].filter(r => r.status === 'rejected');
  expect(fulfilled).toHaveLength(1);                  // exactly one wins
  expect(rejected).toHaveLength(1);                   // exactly one loses
  expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(GoneException);

  // Verify final password is exactly one of the two — never silently overwritten
  const finalUser = await prisma.user.findUnique({ where: { id: userId } });
  // (assert via bcrypt.compare — exactly one of A!/B! matches; the other does not)
});
```

The contract is **`expect(fulfilled).toHaveLength(1)`** — exactly one fulfilled, not
"at least one" and not "two errors" and not "no double-write logged". Anything weaker
gets you PR#85.

## Anti-patterns flagged

- "The window is so tiny no one will hit it" → tiny windows are hit by browser duplicate
  submit, mobile flaky network retry, attacker scripts firing 100 reqs/sec.
- "I'll wrap it in a transaction" → transactions buy you isolation, not CAS predicates.
  You still need the WHERE clause.
- "I'll use a Redis lock" → fine for booking-style cross-row protection, overkill for
  single-row CAS, and adds operational complexity (Redis dependency on a Postgres-only
  flow).
- "I'll add a UNIQUE INDEX on consumedAt" → consumedAt is nullable; UNIQUE on a nullable
  column doesn't enforce CAS, just uniqueness when set.

## Templates

- [Postgres optimistic CAS](../../../templates/postgres-optimistic-cas.template.ts)
- [Race test](../../../templates/race-test.template.ts)
