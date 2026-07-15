---
title: Read → Compute → Write Across a Transaction Boundary Is Race-Vulnerable
type: model
maturity: proven
last-referenced: 2026-07-14
impact: HIGH
impact-description: |
  Any "read X → derive Y from X → write Y inside tx" splits across the tx boundary.
  A concurrent writer between the outer read and the inner write invalidates Y. Five
  separate commits in this codebase fixed this exact pattern at different code sites.
tags: concurrency, transactions, prisma, serializable, tx-scope
applies-to: |
  Any service method that reads a row outside `executeInSerializableTransaction`,
  derives state, then writes inside the tx. Any "*InTx" variant that participates
  in a caller's tx. Booking cancellation, store credit issuance, audit emit, anything
  with derived state that depends on the latest committed row.
related-rules:
  - postgres-optimistic-cas
  - state-machine-first
  - tx-rollback-contract-layers
historical-incidents:
  - admin cancelBooking recomputed cancellation outcome with PRE-tx startTime; concurrent reschedule landed; wrong outcome persisted (B3.2)
  - same race on cancelBookingManage (B3.3)
  - store credit issued post-commit; booking CANCELLED + CREDIT_ISSUED with no actual ledger row (B3.4)
  - grant() did read-after-commit to fetch "the row I just wrote"; returned the OTHER concurrent grant's row
  - assertNoStaffOverlapInTx missed effectiveEndAt extension; IN_PROGRESS extended booking allowed concurrent insert
  - CoachFlow makeup-grant re-read booking status IN-TX but only INSERTed credit/ledger (never wrote the booking row); SSI had a one-way rw-dependency, no cycle, so it did NOT abort the racing cancel — double compensation. Fixed with SELECT … FOR UPDATE on the booking row (round-16)
---

## Why this matters

Read-Modify-Write across a network call is never atomic — that's the bedrock rule of
[storage-gate-not-js](storage-gate-not-js.md). This rule applies the same logic to a
related but more subtle pattern: when you read OUTSIDE a transaction, derive state,
and write INSIDE the transaction, the derived state is computed against a stale snapshot.

Five real incidents in this codebase, all the same shape:

1. **PR-tx read of `booking.startTime` → tx-internal cancellation outcome derivation**.
   A concurrent reschedule lands between the read and the tx open. Outcome computed
   for the old startTime gets persisted; user sees a refund category that doesn't
   match their actual booking time.
2. **Cross-service mutation chain**. `cancelBooking` opens its tx, then calls
   `storeCreditService.issueCredit(...)` which opens ITS OWN tx. If the outer
   commits but the inner rolls back (or vice versa), you have CANCELLED status
   without the credit ledger row.
3. **Read-after-commit to fetch "the row I just wrote"**. `grant()` did
   `await tx.commit(); await tx.row.findUnique(id)`. Concurrent grant() committed
   first; findUnique returned the OTHER grant's row.
4. **Predicate scoped to the wrong field**. `assertNoStaffOverlapInTx` checked
   `endAt` but missed `effectiveEndAt` (extended for IN_PROGRESS bookings); concurrent
   insert allowed because the predicate was wrong.

All fixed by hoisting the read INSIDE the tx callback and recomputing derived state
against the in-tx snapshot.

## Incorrect

```typescript
// ❌ booking.startTime read OUTSIDE tx; concurrent reschedule invalidates the outcome
async cancelBooking(id: string, reason: string) {
  const booking = await this.prisma.booking.findUnique({ where: { id } });
  const outcome = computeCancellationOutcome(booking.startTime, reason);
  // ↑ derived from stale snapshot

  await this.prisma.executeInSerializableTransaction(async (tx) => {
    await tx.booking.update({
      where: { id },
      data: { status: 'CANCELLED', cancellationOutcome: outcome },
    });
    // ↑ concurrent reschedule may have landed; outcome no longer matches latest startTime
    await this.storeCreditService.issueCredit(booking.customerId, outcome.refundAmount);
    // ↑ ALSO opens its own tx — separate atomic unit
  });
}
```

What's wrong:
- L2 read happens outside the tx; latest committed value at the time of the
  in-tx update may differ
- L3 derived outcome is stale by the time the update fires
- L11 `storeCreditService.issueCredit` opens its own tx; if it fails AFTER the
  outer tx commits, you have a partial state

## Correct

```typescript
// ✅ Read inside the tx, recompute derived state, side-effects use *InTx variants
async cancelBooking(id: string, reason: string) {
  await this.prisma.executeInSerializableTransaction(async (tx) => {
    // 1. Read the row INSIDE the tx — Postgres acquires the row's snapshot
    const booking = await tx.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException();

    // 2. Derive outcome from the in-tx snapshot
    const outcome = computeCancellationOutcome(booking.startTime, reason);

    // 3. Write the derived state in the same tx
    await tx.booking.update({
      where: { id },
      data: { status: 'CANCELLED', cancellationOutcome: outcome },
    });

    // 4. Side-effects use *InTx variants that participate in this tx
    await this.storeCreditService.issueCreditInTx(tx, booking.customerId, outcome.refundAmount);
    await this.auditService.emitInTx(tx, { event: 'booking.cancelled', bookingId: id });
  });
}
```

What's right:
- All reads, derivations, and writes are in the same tx callback
- Side-effects use `*InTx(tx, ...)` variants — they participate in the same rollback
- A concurrent reschedule that lands during this tx fails the SERIALIZABLE
  isolation check; Prisma retries the whole callback (re-reading `booking`, re-deriving)
- Either everything commits or nothing does — no partial state

## The *InTx convention

Every service method that mutates state has TWO variants:

```typescript
class StoreCreditService {
  // Caller has no existing tx — opens its own
  async issueCredit(customerId: string, amount: Decimal): Promise<Credit> {
    return this.prisma.executeInSerializableTransaction(async (tx) => {
      return this.issueCreditInTx(tx, customerId, amount);
    });
  }

  // Joins caller's existing tx — participates in caller's commit/rollback
  async issueCreditInTx(
    tx: Prisma.TransactionClient,
    customerId: string,
    amount: Decimal,
  ): Promise<Credit> {
    // implementation
  }
}
```

A service method that calls another mutating service inside a tx **without** using
the `*InTx` variant is a code-review red flag — surface in self-review.

## Banned: read-after-commit to fetch "what I just wrote"

```typescript
// ❌ Concurrent writer can land between commit and findUnique
const id = await this.prisma.executeInSerializableTransaction(async (tx) => {
  const row = await tx.row.create({ ... });
  return row.id;
});
const fresh = await this.prisma.row.findUnique({ where: { id } });
// ↑ may return the OTHER concurrent grant's row

// ✅ Return everything you need from inside the tx
const fresh = await this.prisma.executeInSerializableTransaction(async (tx) => {
  return tx.row.create({ ... });
});
```

## Tests

```typescript
it('cancellation outcome reflects the in-tx booking startTime, not a stale read', async () => {
  const bookingId = await seedBooking({ startTime: in2Hours });

  // Simulate concurrent reschedule that lands during cancellation
  let cancelStarted = false;
  jest.spyOn(prisma, '$transaction').mockImplementationOnce(async (callback) => {
    cancelStarted = true;
    // Simulate other writer landing between outer-read and tx-open
    await prisma.booking.update({ where: { id: bookingId }, data: { startTime: in10Minutes } });
    return callback(prisma);
  });

  await service.cancelBooking(bookingId, 'customer_request');

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  // Outcome should reflect the LATEST startTime (10 minutes), not the original (2 hours)
  expect(booking.cancellationOutcome.category).toBe('LATE'); // not 'EARLY'
});
```

## Sharpening: an in-tx READ is not enough if the tx never WRITES the contended row

The "Correct" example above works because the tx both **reads AND updates the
booking row** — a concurrent writer to that same row creates a
read-write *cycle*, which PostgreSQL SSI detects and aborts. But the retry
guarantee quietly depends on that write. If your tx **reads the contended row
and then only writes ELSEWHERE** (an INSERT into a different table), a plain
in-tx `findFirst` is NOT sufficient:

- Under SERIALIZABLE the in-tx read sees the transaction's **snapshot** — if the
  conflicting write committed after your snapshot began, you read the OLD value,
  so your app-level guard passes.
- The read creates only a **one-way** rw-antidependency (you read what they
  wrote). SSI aborts on a *dangerous structure* (a cycle / pivot), not a single
  edge. With no write to the contended row, there is no back-edge, no cycle —
  **both transactions commit.**

Real incident (CoachFlow, round-16): a makeup-credit grant re-read
`booking.status` inside the tx and rejected `CANCELED`, then INSERTed a
`MakeupCredit` + `+1 MAKEUP_GRANT` ledger row. A cancellation racing in between
committed `status=CANCELED` and its own `CANCEL_RESTORE` — but the grant's tx
never wrote the booking row, so SSI had nothing to abort and the family was
compensated twice. The plain in-tx read looked like a fix and even passed a
seam test (which committed the cancel *before* the tx body, so both a snapshot
read and a locking read observe CANCELED) — the gap only shows under true
concurrency.

**Fix: take an explicit lock or guarded write on the SAME row the other path
mutates.**

```typescript
// ❌ in-tx read, but the tx only INSERTs elsewhere — SSI won't abort the racing cancel
await tx.booking.findFirst({ where: { id }, select: { status: true } });
// ✅ lock the contended row so the two paths serialize deterministically
const [row] = await tx.$queryRaw<Array<{ status: BookingStatus }>>`
  SELECT "status" FROM "Booking" WHERE "id" = ${id} AND "businessId" = ${businessId}
  FOR UPDATE`;
// a committed cancel is now read as CANCELED (→ 409); an in-flight cancel blocks
```

Equivalently, a guarded write against that row (a CAS `updateMany` with a
status precondition, [postgres-optimistic-cas](postgres-optimistic-cas.md)) —
`attendance.service`'s pattern — creates the write-write conflict SSI needs.
Rule of thumb: **the thing you check must be the thing you lock or write.**
"Recompute inside the tx" is necessary but not sufficient; if the recompute is a
bare SELECT and your only writes are inserts elsewhere, add `FOR UPDATE` or a
guarded write on the checked row.

## Anti-patterns

- "I'll read first, that's faster" — you bought 1ms of latency at the cost of a
  silent wrong-outcome bug
- "I re-read it inside the tx, so SERIALIZABLE protects me" — only if the tx also
  WRITES that row; a read + insert-elsewhere is a one-way dependency SSI won't
  abort. Lock it (`FOR UPDATE`) or do a guarded write on it
- "The concurrent reschedule is unlikely" — until it isn't (race tests prove it)
- "I'll wrap the whole thing in a try/catch" — try/catch doesn't add tx semantics;
  side-effects can still partially commit
- "I'll pass the booking object into the side-effect" — the side-effect needs the
  in-tx snapshot too; wrap it
- "Read-after-commit is fine for IDs" — see #4 above; concurrent writers
