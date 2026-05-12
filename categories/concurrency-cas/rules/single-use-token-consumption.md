---
title: Single-Use Token Consumption Predicates the Update on `consumedAt: null`
last-referenced: 2026-05-12
maturity: proven
type: guideline
impact: CRITICAL
impact-description: |
  Any "consume once" semantic (reset link, magic link, invite, refund credit) needs the
  consumption gate IN the storage WHERE clause. The flag-on-row pattern with a JS check
  is the canonical TOCTOU bug.
tags: concurrency, cas, prisma, postgres, single-use, token, password-reset
applies-to: |
  `consumedAt`, `usedAt`, `redeemedAt`, `spent`, `claimed` — any boolean or timestamp
  flag that says "this thing has been used and must not be used again."
related-rules:
  - storage-gate-not-js
  - postgres-optimistic-cas
  - sibling-resource-invariants
historical-incidents:
  - PR#85 round 1 [6a2fde0]
---

## The pattern

```typescript
// ❌ Read-then-update — two concurrent submissions both pass the check
const record = await tx.token.findUnique({ where: { jti } });
if (record.consumedAt !== null) throw new GoneException();
await tx.token.update({ where: { jti }, data: { consumedAt: now } });
```

Race: two concurrent submissions both `findUnique`, both see `consumedAt: null`, both
call `update`. Both succeed. The token is "consumed" twice — meaning whatever the token
authorized (password reset, refund issuance) happens twice.

```typescript
// ✅ Atomic CAS via updateMany with the unconsumed predicate
const result = await tx.token.updateMany({
  where: {
    jti,
    consumedAt: null,                  // ← gate IN the WHERE
    expiresAt: { gt: new Date() },     // ← include expiry in the gate too
  },
  data: { consumedAt: new Date() },
});
if (result.count !== 1) {
  throw new GoneException('Already consumed or expired');
}
```

## Why include `expiresAt: { gt: now }` in the gate

Two reasons:

1. **Same-tx CAS for both flags**: if you check expiry separately in JS (`if (record.expiresAt < now)`),
   you've reintroduced the TOCTOU. Some other writer might extend the expiry (rare but
   possible in some flows), and your stale read would reject a still-valid token.

2. **Single round trip**: `updateMany` evaluates the entire predicate atomically. No need
   for a separate query.

## Sibling tokens — the OTHER thing this rule needs

A user can request multiple reset tokens (multi-tab, browser duplicate, lost-then-found
email). When the user successfully consumes ONE, **all the others must be revoked in the
same transaction**.

```typescript
// In applyPasswordReset, AFTER the user-row CAS update:
await tx.passwordResetToken.updateMany({
  where: { userId, consumedAt: null },
  data: { consumedAt: new Date() },
});
```

Without this: an attacker who intercepted the user's first email can replay that link
AFTER the user successfully resets via the second email, and overwrite the user's
just-set password. PR#85 sibling-resource finding.

See [sibling-resource-invariants.md](sibling-resource-invariants.md) for the full pattern.

## Tests

```typescript
it('two concurrent valid consumes of the same jti — exactly one succeeds', async () => {
  const jti = randomBytes(16).toString('hex');
  await prisma.token.create({ data: { jti, expiresAt: future, consumedAt: null } });

  const [a, b] = await Promise.allSettled([
    service.consume(jti),
    service.consume(jti),
  ]);

  expect(a.status === 'fulfilled' || b.status === 'fulfilled').toBe(true);
  expect(a.status === 'fulfilled' && b.status === 'fulfilled').toBe(false);

  // At-most-one fulfilled, at-least-one fulfilled → exactly one
  const fulfilledCount = [a, b].filter(r => r.status === 'fulfilled').length;
  expect(fulfilledCount).toBe(1);
});

it('consuming a token also revokes sibling tokens for the same user', async () => {
  const linkA = await service.issueLink(userId);
  const linkB = await service.issueLink(userId);

  await service.resetPassword({ token: linkA.token, newPassword: '...' });

  // linkB should now have consumedAt set (revoked as a sibling)
  const linkBAfter = await prisma.passwordResetToken.findUnique({ where: { jti: linkB.jti } });
  expect(linkBAfter?.consumedAt).not.toBeNull();

  // Submitting linkB now must fail
  await expect(service.resetPassword({ token: linkB.token, newPassword: '...' }))
    .rejects.toThrow(GoneException);
});
```
