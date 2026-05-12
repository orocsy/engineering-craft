---
title: Shareable Tokens Mint Once Per Resource — Don't Re-mint on Demand
type: decision
maturity: verified
last-referenced: 2026-05-12
impact: MEDIUM
impact-description: |
  ensureQrToken re-minted on every call past expiry-grace, overwriting the original
  token. Customer's printed receipts and screenshots returned 404 instead of intended
  410 — staff couldn't see the refresh-on-phone copy.
tags: tokens, qr, receipts, sharing, mint-once
applies-to: |
  Any token meant to be shareable, printable, or scannable (QR receipts, magic
  links, invite codes, public share URLs).
related-rules:
  - single-use-token-consumption
historical-incidents:
  - 1bea785 — ensureQrToken re-minted on every call past expiry-grace; overwrote original; old screenshots returned 404 instead of 410
---

## Why this matters

Tokens have two shapes:
- **Mint-on-demand**: ephemeral; client always asks server for a fresh one (login, CSRF)
- **Mint-once**: persistent; the same token value is shareable / printable

For mint-once tokens, **the value MUST be stable across requests for the same
resource**. Re-minting orphans every previously-shared copy.

The PR#85 incident: `ensureQrToken(bookingId)` overwrote the booking's QR token
on every call past expiry-grace. Customers who had:
- Printed the QR
- Saved a screenshot
- Forwarded the email confirmation
…all got 404 when staff scanned, instead of the intended 410-Gone (which would
have triggered a "show fresh QR on phone" copy).

## The decision

For each token, classify ahead of time:

| Trait | mint-on-demand | mint-once |
|-------|---------------|-----------|
| Shareable / printable? | No | **Yes** |
| Expiry behavior | Refresh silently | Surface 410 explicitly |
| Storage | Maybe none (JWT) | Row keyed by (resource_id, token_value) |
| Revocation model | Time-based | Explicit consume / explicit revoke |
| Re-mint policy | Always allowed | NEVER on path that's reachable from share link; only on user-initiated regenerate |

If the token gets printed / screenshotted / forwarded, it's mint-once. Default to
mint-once for any token that surfaces in customer-facing UI.

## Incorrect

```typescript
// ❌ Re-mints whenever the existing token is past expiry-grace
async ensureQrToken(bookingId: string): Promise<string> {
  const booking = await this.prisma.booking.findUnique({
    where: { id: bookingId },
    select: { qrToken: true, qrExpiresAt: true },
  });

  if (!booking.qrToken || booking.qrExpiresAt < new Date()) {
    const fresh = randomBytes(16).toString('hex');
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { qrToken: fresh, qrExpiresAt: in15Minutes() },
    });
    return fresh; // ← previous token is now orphaned
  }
  return booking.qrToken;
}
```

The path `customer scans expired QR → /scan?token=OLD → service.scan(OLD)` returns
404 because OLD is no longer in the booking row. The customer doesn't understand
why; the staff doesn't know to say "the QR refreshed on your phone."

## Correct — separate "the canonical token" from "the active grace window"

```typescript
// ✅ Mint once at booking creation; never re-mint on read
async createBooking(data: CreateBookingDto): Promise<Booking> {
  const qrToken = randomBytes(16).toString('hex');
  return this.prisma.booking.create({
    data: { ...data, qrToken, qrIssuedAt: new Date() },
  });
}

// ✅ Scan: look up by token; return 410 if expired (NOT 404)
async scan(token: string): Promise<ScanResult> {
  const booking = await this.prisma.booking.findFirst({
    where: { qrToken: token },
    select: { id: true, status: true, qrIssuedAt: true, scheduledTime: true },
  });
  if (!booking) {
    throw new NotFoundException('QR not recognized');
  }
  if (this.isExpired(booking)) {
    throw new GoneException({
      code: 'QR_EXPIRED',
      message: 'This QR has expired. Ask the customer to refresh on their phone.',
      bookingId: booking.id, // staff can still proceed manually
    });
  }
  return { booking, action: this.nextAction(booking) };
}

// ✅ Explicit user-initiated regenerate (separate endpoint)
async regenerateQr(bookingId: string, actorId: string): Promise<string> {
  const fresh = randomBytes(16).toString('hex');
  await this.prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: { qrToken: fresh, qrIssuedAt: new Date() },
    });
    await tx.qrAuditLog.create({
      data: { bookingId, actorId, action: 'REGENERATED', at: new Date() },
    });
  });
  return fresh;
}
```

Differences:
1. `ensureQrToken` doesn't exist — read paths NEVER mint
2. Scan returns 410 (Gone) for expired, not 404 (Not Found)
3. Regenerate is explicit, audit-logged, user-initiated
4. The 410 body includes `bookingId` so staff can fall back to manual lookup
5. Frontend pattern-matches `code: 'QR_EXPIRED'` to render "ask customer to refresh"

## Audit log for shareable tokens

Every regenerate writes an audit row. Why: shareable tokens are credentials.
Knowing who minted the current value, when, and from what client matters for
abuse investigation.

## Tests

```typescript
describe('QR token mint-once', () => {
  it('does NOT change qrToken on read paths', async () => {
    const b = await service.createBooking(data);
    const first = b.qrToken;
    // Wait past expiry grace
    jest.useFakeTimers().setSystemTime(in16Minutes());
    await service.scan(first); // throws GoneException — but read shouldn't mint
    const after = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(after.qrToken).toBe(first); // ← unchanged
  });

  it('returns 410 with code QR_EXPIRED for past-expiry tokens', async () => {
    const b = await service.createBooking(data);
    jest.useFakeTimers().setSystemTime(in16Minutes());
    await expect(service.scan(b.qrToken)).rejects.toMatchObject({
      status: 410,
      response: { code: 'QR_EXPIRED', bookingId: b.id },
    });
  });

  it('regenerate endpoint changes qrToken AND writes audit log', async () => {
    const b = await service.createBooking(data);
    const first = b.qrToken;
    await service.regenerateQr(b.id, 'staff-1');
    const after = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(after.qrToken).not.toBe(first);
    const log = await prisma.qrAuditLog.findFirst({ where: { bookingId: b.id } });
    expect(log).toMatchObject({ actorId: 'staff-1', action: 'REGENERATED' });
  });
});
```

## Anti-patterns

- `ensureXToken` pattern that mints on read paths
- 404 instead of 410 for expired tokens — loses the "fresh one exists, refresh"
  signal
- Re-minting without audit log
- "Re-minting is fine because it's our own QR" — the tokens are in customer
  inboxes / printers / screenshots; you don't control them
