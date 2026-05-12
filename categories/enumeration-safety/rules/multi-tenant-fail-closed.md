---
title: Multi-Tenant Fail-Closed on Ambiguous Identifiers
last-referenced: 2026-05-12
maturity: verified
type: guideline
impact: HIGH
impact-description: |
  When the same identifier (email, phone) could match >1 user across tenants, `findFirst`
  arbitrarily picks one — letting an attacker who controls a different tenant's same-email
  account hijack the password-reset flow for the intended account.
tags: multi-tenancy, password-reset, enumeration, fail-closed, prisma
applies-to: |
  Any user lookup by identifier in a multi-tenant schema where the identifier is NOT
  globally unique. Email, phone, customer external ID, etc.
related-rules:
  - timing-oracle
historical-incidents:
  - PR#85 round 2 [11fb1aa]
---

## Why this matters

Our schema allows the same email across tenants:
```prisma
model User {
  id       String
  email    String
  tenantId String
  @@unique([email, tenantId])  // unique within tenant, NOT globally
}
```

This is correct: a single human can be a salon owner at Tenant A AND a customer-facing
operator at Tenant B with the same business email.

But the password-reset endpoint takes ONLY the email (no tenant context — the user hasn't
logged in yet). If we use `findFirst({ where: { email } })`, Prisma picks an arbitrary
matching row — usually the first one created, but not guaranteed.

Attack: attacker creates a Tenant B account with `victim@example.com`. The victim has a
Tenant A account with the same email. Victim requests a reset; our `findFirst` returns
the attacker's Tenant B account; we email a reset link for the attacker's account; nothing
happens to the victim. Worse: if the email-link generator uses tenant from the row picked,
the victim never gets a reset and has no idea why.

(In our app the link goes to the `User.email` directly so the victim DOES get *some* link
— but if it's keyed to the attacker's tenant, the link resets the attacker's password.
Net: confusion + denial-of-service for the legit owner. With more sophisticated payloads,
hijack.)

## Incorrect

```typescript
// ❌ Picks an arbitrary row when email collides across tenants
const user = await prisma.user.findFirst({ where: { email, isActive: true } });
if (!user) {
  await equalizeBcryptTiming();
  return;
}
```

## Correct

```typescript
// ✅ Fail closed when ambiguous — return early as if the email didn't exist
const candidates = await prisma.user.findMany({
  where: { email, isActive: true },
  select: { id: true, tenantId: true, email: true },
});

if (candidates.length !== 1) {
  // 0 candidates: email doesn't exist (normal not-found)
  // 2+ candidates: ambiguous — fail closed (do not pick one arbitrarily)
  await equalizeBcryptTiming();
  return;
}

const user = candidates[0];
// ... proceed with reset
```

## Why this is an enumeration-safety rule, not just a multi-tenancy one

The "fail closed when ambiguous" branch returns the same response (204) and same wall-
clock time (equalizer) as the not-found branch. So:
- Attacker can't tell the difference between "no such email" and "email is ambiguous."
- Attacker can't enumerate which emails are shared across tenants by observing response
  variance.
- If the victim's account is ambiguous, the victim simply doesn't get a reset email —
  same UX as if they typed the wrong address. The victim contacts support, support sees
  the warn log, surfaces the fact that the email is registered in multiple tenants,
  helps the victim through alternative recovery (admin-issued reset).

## What about: just always fail closed on ambiguity?

That's exactly what we do. The "edge case" (legit user with multi-tenant email) is rare
enough that a support ticket is acceptable. The security gain (no hijack) is mandatory.

## Operational handling

Log the ambiguous case with structured context so support can find it:
```typescript
if (candidates.length > 1) {
  this.logger.warn(
    {
      email_hash: hashForLog(email),  // never log raw email
      tenant_count: candidates.length,
      tenants: candidates.map(c => c.tenantId),
    },
    'forgot-password: ambiguous email across multiple tenants — failing closed',
  );
  await equalizeBcryptTiming();
  return;
}
```

The hash-for-log keeps PII out of logs while letting support correlate via the same
hash function.

## Tests

```typescript
it('returns 204 with no email sent when an email matches multiple tenants', async () => {
  await prisma.user.create({ data: { email: 'shared@example.com', tenantId: 'tenant-a', ... } });
  await prisma.user.create({ data: { email: 'shared@example.com', tenantId: 'tenant-b', ... } });

  const resp = await request(app).post('/auth/forgot-password').send({ email: 'shared@example.com' });
  expect(resp.status).toBe(204);
  expect(mockResend.send).not.toHaveBeenCalled();

  // No reset link in DB either
  const tokens = await prisma.passwordResetToken.findMany({ where: {} });
  expect(tokens).toHaveLength(0);
});

it('still returns 204 within the same timing envelope as a not-found email', async () => {
  // ... timing test from timing-oracle.md, but with the ambiguous branch
});
```

## Anti-patterns

- "I'll use `findFirst` for performance" — `findMany` returns 1 or 2 rows; same indexes;
  same query plan; speed difference is negligible
- "I'll pick the first row sorted by createdAt" — still vulnerable; attacker creates
  account first
- "I'll require the user to specify their tenant" — that's a different flow (admin
  console login form), not consistent with email-only forgot-password UX
- "Cross-tenant email collision is rare" — yes, until your platform has 10K tenants
  and one human is in 3 of them
