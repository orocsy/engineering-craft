---
title: Async completion events must re-validate the live pointer, not the entity's status
type: guideline
maturity: verified
impact: CRITICAL
impact-description: |
  An async success event (webhook, job completion, callback) that routes on
  the funded/target entity's STATUS silently mis-applies money or work when
  the entity was re-pointed between initiation and completion. The failure
  is invisible: every module-scoped test passes, the books look right, the
  customer is silently overcharged or the work double-applied.
tags: webhooks, async, race, pointer, payments, cas
applies-to: |
  Any handler consuming an async completion event for a resource that a
  MUTABLE local pointer connects to its beneficiary (payment→booking,
  job→task, upload→record) — where the beneficiary can be re-pointed,
  re-funded, or re-assigned while the async operation is in flight.
related-rules:
  - single-use-token-consumption
  - sibling-resource-invariants
historical-incidents:
  - "a real incident: an expired-and-swept card hold's PaymentIntent succeeded late after the seat was re-booked with different funding — the webhook routed on booking status, re-confirmed the re-funded booking, and kept the charge (silent overcharge); 678 unit tests, 7 E2E journeys and every per-unit gate passed over it; found only by a whole-system adversarial review"
last-referenced: 2026-07-12
---

## Why this matters

Between "async operation initiated for entity E" and "async success event
arrives", E can be re-pointed to a different funding/source/owner. The
event handler that asks "what STATE is E in?" is asking a proxy question.
The correctness question is **"does E still point at THIS operation?"** —
status-routing mis-handles every ordering in which the pointer moved.

## Incorrect

```ts
// ❌ Routes on entity status — a proxy that lies after re-pointing
async applySucceeded(payment: Payment, booking: Booking) {
  if (booking.status === "CANCELED") return this.lateRefund(payment);
  return this.confirm(booking, payment); // booking may be funded by a DIFFERENT payment now
}
```

## Correct

```ts
// ✅ The pointer IS the invariant: a payment only confirms the entity it
// CURRENTLY funds. Covers every status/ordering uniformly.
async applySucceeded(payment: Payment, booking: Booking) {
  if (booking.paymentId !== payment.id) {
    // capture the money truthfully, then hand it back — never resurrect
    return [this.captureAndInvoice(payment), this.lateRefund(payment)];
  }
  return this.confirm(booking, payment);
}
```

Distinguish the TWO pointers this requires in schema: the mutable
"current" pointer (`Booking.paymentId`) vs the permanent history back-ref
(`Payment.bookingId`). Conflating them is how this class of bug gets in.

## Tests

- Ordering matrix: initiate → re-point → event arrives (per prior status).
- The re-pointed case asserts BOTH truthful capture AND compensation —
  never resurrection of the re-pointed entity.

## Anti-patterns

- Adding one more status to the status-switch instead of checking the pointer.
- "Fixing" by refusing re-pointing — verify what that strands first (in the
  incident, it would have permanently blocked the customer).
