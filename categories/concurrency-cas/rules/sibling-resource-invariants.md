---
title: Single-Use Applies to the User, Not Just to a Single Token
last-referenced: 2026-05-12
maturity: verified
type: guideline
impact: HIGH
impact-description: |
  When a user-facing action (password reset) is reachable via multiple credentials (link
  + OTP, email + SMS), consuming one MUST revoke the others in the same transaction.
  Otherwise stale credentials remain dangerous after the user has reset.
tags: concurrency, single-use, token, password-reset, sibling
applies-to: |
  Any flow where >1 token grants access to the same effect: password reset, magic links,
  invite acceptance, refund issuance, deletion confirmations.
related-rules:
  - single-use-token-consumption
  - postgres-optimistic-cas
historical-incidents:
  - PR#85 round 3 (sibling-resource invariant) [0428f5f]
---

## The bug

User clicks "Resend reset email" twice. Two valid links are now in their inbox. They
click the second one, set a new password. The first link is still valid in their inbox.

If anyone has access to that first email — forwarded thread, mobile device left unlocked,
attacker who screenshotted the URL, archived in a corporate filter — they can now
overwrite the just-set password.

## The fix

Inside the same transaction as the password change, bulk-revoke ALL outstanding reset
tokens for the user:

```typescript
await this.prisma.$transaction(async (tx) => {
  // 1. Consume the credential being used (CAS — single-use-token-consumption)
  const consumed = await tx.passwordResetToken.updateMany({
    where: { jti: thisJti, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) throw new GoneException();

  // 2. Apply the password change (postgres-optimistic-cas)
  await applyPasswordReset(tx, userId, newPassword);

  // 3. Revoke ALL sibling tokens for this user — this is the rule
  await tx.passwordResetToken.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: now },
  });
});
```

## Why "in the same transaction"

If revocation is a separate await OUTSIDE the transaction:
- Tx commits with new password.
- Process crashes / network drops / API restarts before sibling revocation runs.
- User has new password, but stale links are still valid.

Inside the tx, revocation is atomic with the password update. Either both happen or
neither does.

## Why "revoke ALL outstanding," not just "revoke the one we know about"

There may be more than one outstanding token. The user could have requested 3 reset
emails. The fix needs to be a `updateMany WHERE userId AND consumedAt: null`, not
`update WHERE jti = otherJti` (which assumes you know about every sibling).

## Cross-mechanism revocation: link + OTP

Password reset is reachable via TWO mechanisms in our app:
- Reset link (Postgres `passwordResetToken` row)
- OTP (Redis `pwreset:otp:<tenantId>:<userId>` key)

When EITHER is consumed, the OTHER must be invalidated:

```typescript
// In the link reset path, after applying password:
await tx.passwordResetToken.updateMany({
  where: { userId, consumedAt: null },
  data: { consumedAt: now },
});
await this.redis.del(this.otpKey(tenantId, userId));  // ← also kill any active OTP

// In the OTP reset path, after applying password:
await tx.passwordResetToken.updateMany({
  where: { userId, consumedAt: null },
  data: { consumedAt: now },
});
// (OTP key already deleted by the consume Lua)
```

The session invalidation step (incrementing `tokenVersion` on the user row, see
[postgres-optimistic-cas.md](postgres-optimistic-cas.md)) closes the loop on existing
sessions — but not on outstanding reset credentials.

## Tests

```typescript
it('after a successful reset, all outstanding reset links for the user are revoked', async () => {
  const linkA = await service.issueResetLink(email);
  const linkB = await service.issueResetLink(email);  // user clicked "Resend"
  const linkC = await service.issueResetLink(email);  // user clicked "Resend" again

  await service.resetPassword({ token: linkB.token, newPassword: '...' });

  // A and C should now be unusable
  await expect(service.resetPassword({ token: linkA.token, newPassword: '...' }))
    .rejects.toThrow(GoneException);
  await expect(service.resetPassword({ token: linkC.token, newPassword: '...' }))
    .rejects.toThrow(GoneException);
});

it('successful link reset also invalidates an active OTP for the same user', async () => {
  await service.requestPasswordResetOtp({ email });
  const link = await service.issueResetLink(email);

  await service.resetPassword({ token: link.token, newPassword: '...' });

  // The OTP key in Redis should be gone
  const otpAfter = await redis.get(otpKey(tenantId, userId));
  expect(otpAfter).toBeNull();
});

it('successful OTP reset also revokes outstanding reset link rows for the user', async () => {
  const link = await service.issueResetLink(email);
  await service.requestPasswordResetOtp({ email });
  const code = '123456'; // (use the seam to inject in tests)

  await service.resetPasswordOtp({ email, code, newPassword: '...' });

  const linkAfter = await prisma.passwordResetToken.findUnique({ where: { jti: link.jti } });
  expect(linkAfter?.consumedAt).not.toBeNull();
});
```

## Anti-patterns

- "We document that the user should only request one reset email" → users don't read.
- "We rate-limit reset requests" → rate limits gate request rate, not security.
- "Old tokens expire in 15min" → that's a 15-minute attack window AFTER the user reset.
- "Only the most recent token is valid" → that's exactly this rule. Implement it.
