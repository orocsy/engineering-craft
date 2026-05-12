---
title: Every Mutating Service Method Needs `*InTx(tx, ...)` AND Standalone Variants
type: process
maturity: verified
last-referenced: 2026-05-12
impact: HIGH
impact-description: |
  Service A's tx commits, then Service B (called from A) opens its own tx and rolls
  back. Net result: silent partial commit. Booking-cancel can leave booking
  CANCELLED + credit ledger row missing — affects customer-visible balances.
tags: transactions, prisma, service-composition, tx-scope, atomic
applies-to: |
  Every service method that mutates state. When service A calls service B from
  inside a transaction, B must accept and reuse A's tx.
related-rules:
  - cross-tx-cas-recompute-inside-tx
  - postgres-optimistic-cas
historical-incidents:
  - 59377d9 — PR #66 P1 — store-credit issueCredit opened its own tx instead of accepting an existing tx; outer booking tx had already committed; booking-cancel update could rollback while credit ledger row stayed written
---

## Why this matters

`prisma.$transaction(async (tx) => {...})` opens a new tx. If you call another
service inside that callback and the called service ALSO opens its own tx, you
have two SEPARATE atomic units. Either can succeed or fail independently:

- Outer commits, inner rolls back → outer's mutations stick, inner's vanish
- Inner commits first, outer rolls back → inner's mutations stick, outer's vanish

Either way: **silent partial commit**. The user sees one mutation; the other
is gone. Customer balances drift. Audit logs lie.

## The two-variant pattern

Every service method that mutates state has two variants:

```typescript
class StoreCreditService {
  /**
   * Issue store credit. Opens its OWN transaction.
   * Use when the caller has no existing tx.
   */
  async issueCredit(customerId: string, amount: Decimal, reason: string): Promise<Credit> {
    return this.prisma.$transaction(async (tx) => {
      return this.issueCreditInTx(tx, customerId, amount, reason);
    });
  }

  /**
   * Issue store credit, joining the caller's existing transaction.
   * Use when called from inside another service's $transaction callback.
   * Participates in the caller's commit/rollback.
   */
  async issueCreditInTx(
    tx: Prisma.TransactionClient,
    customerId: string,
    amount: Decimal,
    reason: string,
  ): Promise<Credit> {
    return tx.credit.create({
      data: { customerId, amount, reason, issuedAt: new Date() },
    });
  }
}
```

Naming convention: `methodName` opens its own tx; `methodNameInTx(tx, ...)` joins
caller's. The `InTx` suffix is searchable; absence is a red flag.

## Incorrect — the PR#66 P1 pattern

```typescript
// ❌ Outer service opens tx; inner opens its OWN tx
class BookingService {
  async cancelBooking(id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id } });
      const outcome = computeOutcome(booking, reason);

      await tx.booking.update({
        where: { id },
        data: { status: 'CANCELLED', cancellationOutcome: outcome },
      });

      // ↓ This opens a SEPARATE tx — partial commit risk
      await this.storeCreditService.issueCredit(
        booking.customerId,
        outcome.refundAmount,
        `Booking ${id} cancellation`,
      );
    });
  }
}
```

What's wrong:
- Outer tx (booking update) opens at L3
- Inner call at L14 ignores the outer `tx` and opens its own
- If the outer tx's commit succeeds but the inner's fails (e.g., serialization
  failure on credit table), booking is CANCELLED but no credit row exists
- Or worse: outer fails, inner already committed → credit issued for a booking
  that's still active

## Correct

```typescript
// ✅ Outer service opens tx; inner joins
class BookingService {
  async cancelBooking(id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id } });
      const outcome = computeOutcome(booking, reason);

      await tx.booking.update({
        where: { id },
        data: { status: 'CANCELLED', cancellationOutcome: outcome },
      });

      // ↓ Joins outer tx — atomic with the booking update
      await this.storeCreditService.issueCreditInTx(
        tx,
        booking.customerId,
        outcome.refundAmount,
        `Booking ${id} cancellation`,
      );

      // ↓ Same pattern for audit, notifications, anything mutating
      await this.auditService.emitInTx(tx, { event: 'booking.cancelled', id });
    });
  }
}
```

What's right:
- Single tx wraps everything
- All mutations share commit/rollback fate
- If credit issue fails, booking update rolls back too — user sees "cancellation
  failed" rather than "cancelled but no refund"

## Code-review red flag

In a code review, this line is always a red flag inside an outer `$transaction` callback:

```typescript
await this.someService.someMethod(...)  // ← does this open its own tx?
```

If yes, two questions:
1. Is there a `*InTx` variant? Use it.
2. Is the called method idempotent / side-effect-free? If yes, calling it from
   inside the tx is fine. If no, you have the partial-commit risk.

## What about external side-effects?

Things that genuinely can't be transactional (Stripe API calls, email sends,
Redis writes) should happen AFTER the tx commits, AND should be designed for
retry / outbox pattern:

```typescript
// ✅ Tx-internal: write the outbox row atomically with the booking update
await this.prisma.$transaction(async (tx) => {
  await tx.booking.update({ ... });
  await tx.outbox.create({
    data: { event: 'booking.cancelled', payload: { ... } },
  });
});

// ✅ Tx-external: a worker drains the outbox, calls Stripe, marks dispatched
// (idempotent on retry, so duplicate Stripe calls are safe)
```

The outbox pattern decouples external side-effects from your tx without losing atomicity.

## Tests

```typescript
it('cancellation rolls back credit issue if booking update fails', async () => {
  // Force outer update to fail mid-tx
  jest.spyOn(prisma.booking, 'update').mockRejectedValueOnce(new Error('boom'));

  await expect(
    service.cancelBooking(bookingId, 'test'),
  ).rejects.toThrow('boom');

  // Verify NO credit row was created (inner was rolled back)
  const credits = await prisma.credit.findMany({ where: { customerId } });
  expect(credits).toHaveLength(0);
});
```

## Anti-patterns

- Calling `someService.someMethod()` from inside `$transaction` without checking
  whether it opens its own tx
- Creating a `*InTx` variant by passing the tx but still calling
  `prisma.$transaction(...)` inside (defeats the point)
- "I'll wrap with try/catch around the inner call" — try/catch doesn't add tx
  semantics; rollback is per-tx
- "External APIs need their own try/catch anyway" — true, but they belong outside
  the tx via outbox; not inside
