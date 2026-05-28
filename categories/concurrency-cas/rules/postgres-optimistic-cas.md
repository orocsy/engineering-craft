---
title: Postgres Optimistic CAS via WHERE Predicate (tokenVersion Pattern)
last-referenced: 2026-05-12
maturity: proven
type: guideline
impact: CRITICAL
impact-description: |
  When N entry points lead to the same write, the CAS goes on the WRITE, not on each
  entry-point gate. Per-entry gates are nice-to-have layers; the write-layer gate is
  the load-bearing one.
tags: concurrency, cas, postgres, prisma, optimistic-locking, password-reset
applies-to: |
  Any user-row write that can be triggered from >1 endpoint or >1 credential type.
  Especially `applyPasswordReset` (link OR OTP), profile updates, role changes.
related-rules:
  - state-machine-first
  - storage-gate-not-js
  - sibling-resource-invariants
historical-incidents:
  - a real incident: cross-method password write race — link CAS and OTP CAS both reached `applyPasswordReset`
---

## Why this matters

In a real password-reset incident, two flows could both reach the user-row write:
- Email-link reset gates on `passwordResetToken.consumedAt` CAS (Postgres)
- OTP reset gates on Redis Lua compare-and-delete

Both then call `applyPasswordReset`, which does a single `tx.user.update`. The link's
CAS protected the link from being re-used; the OTP's CAS protected the OTP from being
re-used; but neither protected the **user row** from a concurrent write via the OTHER
flow.

Race: attacker holds an old reset link (intercepted email, screenshot, browser history).
The legitimate owner requests an OTP, resets the password. The attacker submits the link
moments later — Lua-CAS-locked OTP doesn't matter, link CAS still passes (token wasn't
consumed yet because it predated the OTP), and the link write **overwrites the
just-set password**.

The fix: add a CAS predicate at the WRITE layer using a version counter (`tokenVersion`)
that any successful credential consumption increments.

## Incorrect

```typescript
// ❌ Two `tx.user.update()` calls run in parallel transactions.
// Last writer wins. No predicate at the WRITE — gates were upstream.

private async applyPasswordReset(tx: Prisma.TransactionClient, userId: string, newPassword: string) {
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await tx.user.update({
    where: { id: userId },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });
  // (also revokes sibling tokens — see sibling-resource-invariants.md)
}
```

What's wrong:
- L4-7 `update` predicates only on `id`. Postgres takes the row lock per tx, then writes.
- Two concurrent txs (link + OTP) both pass the lock acquisition (different times) and
  both write. Whichever commits last wins.
- `tokenVersion: { increment: 1 }` is also subject to the race: if both reads see
  version=N, both write version=N+1, but the database stores N+1 once (atomic increment),
  meaning the version column is intact but the *password* was overwritten.

## Correct

```typescript
// ✅ CAS on a version captured at start of transaction.
// Loser sees count=0 and aborts.

private async applyPasswordReset(tx: Prisma.TransactionClient, userId: string, newPassword: string) {
  const userBefore = await tx.user.findUnique({
    where: { id: userId },
    select: { tokenVersion: true },
  });
  if (!userBefore) {
    throw new NotFoundException('User not found');
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  const result = await tx.user.updateMany({
    where: {
      id: userId,
      tokenVersion: userBefore.tokenVersion,    // ← CAS predicate
    },
    data: {
      passwordHash,
      tokenVersion: { increment: 1 },
    },
  });

  if (result.count !== 1) {
    throw new ConflictException(
      'Concurrent password reset detected — please request a fresh credential and retry',
    );
  }

  // Revoke sibling reset tokens (see sibling-resource-invariants.md)
  await tx.passwordResetToken.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
}
```

What's right:
- L2-4 `findUnique` captures the current `tokenVersion` (call it V).
- L13 `updateMany` predicate: `id = userId AND tokenVersion = V`. Postgres re-evaluates
  this against the latest committed row at lock time — even if your `findUnique` read
  was stale.
- L20-23 The CAS-loser branch. Loser saw V at read, but by the time they got the row
  lock, version had advanced to V+1 (the winner's increment). Predicate fails, count=0,
  throw 409.

## Why this works under READ COMMITTED

Postgres re-evaluates `UPDATE ... WHERE` predicates against the **latest committed row**
at lock time. Sequence of events:

1. Tx A `findUnique` reads version=5. Holds no lock.
2. Tx B `findUnique` reads version=5. Holds no lock.
3. Tx A `updateMany WHERE version=5` acquires row lock. Postgres sees version=5 in latest
   committed → predicate matches → write {version=6, password=A}. Commit.
4. Tx B `updateMany WHERE version=5` waits for the lock. Acquires it.
   Postgres re-evaluates: latest committed is now version=6 → predicate FAILS → count=0.
5. Tx B sees count=0 and throws ConflictException.

You do NOT need SERIALIZABLE for this. READ COMMITTED + the WHERE predicate are
sufficient.

## Tests

```typescript
it('two concurrent password resets via different credentials — only one commits', async () => {
  // Setup: user with both an outstanding reset link AND an outstanding OTP
  const linkJti = await issueLink(userId);
  await issueOtp(userId, '123456');

  const [linkResult, otpResult] = await Promise.allSettled([
    service.resetPassword({ token: signJwt(linkJti), newPassword: 'LINK!' + rand() }),
    service.resetPasswordOtp({ email, code: '123456', newPassword: 'OTP!' + rand() }),
  ]);

  // Exactly one must succeed; the other must throw ConflictException
  const fulfilled = [linkResult, otpResult].filter(r => r.status === 'fulfilled');
  const conflicts = [linkResult, otpResult]
    .filter(r => r.status === 'rejected')
    .filter(r => (r as PromiseRejectedResult).reason instanceof ConflictException);

  expect(fulfilled).toHaveLength(1);
  expect(conflicts).toHaveLength(1);

  // Verify final password matches whichever credential won
  const user = await prisma.user.findUnique({ where: { id: userId } });
  // ... bcrypt compare against both candidates, exactly one matches
});
```

## When to use SERIALIZABLE instead

If your CAS predicate needs to span **multiple rows** (e.g. "no booking exists in this
time range for this staff member"), READ COMMITTED won't help — there's no single row
to take a lock on. That's where you need either:
- SERIALIZABLE isolation + retry-on-serialization-failure, OR
- A pre-computed lock key (Redis distributed lock) + serializable tx (the booking pattern)

For single-row CAS like password reset, READ COMMITTED + WHERE predicate is correct
and cheaper.

## Anti-patterns

- "I'll lock with `SELECT FOR UPDATE`" → fine and equivalent for single-row CAS, but
  more verbose and requires raw SQL or Prisma `$queryRaw`. The optimistic pattern is
  cleaner for the common case.
- "I'll just trust the upstream gate" → that's the bug — the exact cross-method write race
  this rule came from. Per-entry gates are layered defenses, not the load-bearing one.
- "I'll add a single global mutex" → kills throughput; doesn't generalize.

## Templates

- [postgres-optimistic-cas.template.ts](../../../templates/postgres-optimistic-cas.template.ts)
