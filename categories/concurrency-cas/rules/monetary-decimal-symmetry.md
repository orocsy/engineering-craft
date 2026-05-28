---
title: Monetary Fields Use Prisma.Decimal End-to-End; Cross-Path Selects Must Align
type: guideline
maturity: verified
last-referenced: 2026-05-12
impact: MEDIUM
impact-description: |
  `as unknown as number` casts around Prisma.Decimal silently break precision.
  When two paths (admin / customer) write the same column, in-tx select shapes
  must be aligned with a comment locking them — surface asymmetry in code review
  even when the current diff doesn't touch the misaligned column.
tags: prisma, decimal, monetary, precision, symmetry
applies-to: |
  Any column representing money (price, refundAmount, depositPaid, credit balance,
  invoice total). Any pair of admin/customer or read/write paths touching the same
  column.
related-rules:
  - libs-first-no-reinventing
historical-incidents:
  - `as unknown as number` cast around Prisma.Decimal was unnecessary tech-debt cargo-culted from booking.service
  - customer cancel select included tenantId; admin cancel didn't; pre-existing asymmetry surfaced when adding depositPaid to both
---

## Why this matters

`Prisma.Decimal` exists for a reason: float arithmetic on money silently loses
cents. `0.1 + 0.2` returns `0.30000000000000004` in IEEE 754. After 1000 booking
payouts, your balance differs from the customer's by a non-trivial amount.

Two failure modes from this codebase:

1. **Decimal coerced to number**:
```typescript
const refund = booking.refundAmount as unknown as number;
const total = refund + tax; // ← float math; precision loss
```

2. **Cross-path select asymmetry**: admin's cancel-flow `select` shape and
customer's cancel-flow `select` shape diverge. Adding a new field (e.g.,
`depositPaid`) requires touching both. Pre-existing asymmetry (one had
`tenantId`, one didn't) means one path errors at runtime when the new field's
computation depends on a missing column.

## Required reflexes

### Decimal end-to-end; never coerce

```typescript
import { Prisma } from '@prisma/client';

// ❌ Coerce to number; precision lost
const refund = booking.refundAmount as unknown as number;
const total = refund + tax;

// ✅ Decimal arithmetic
const refund: Prisma.Decimal = booking.refundAmount;
const total = refund.add(tax); // also Decimal
```

For DTOs going to the wire (JSON):
```typescript
// ✅ Serialize at the boundary, NOT during arithmetic
class BookingResponseDto {
  @Transform(({ value }) => (value as Prisma.Decimal).toFixed(2))
  refundAmount: string; // string in JSON; full precision preserved
}
```

Frontend receives a string, parses with a Decimal-equivalent lib (`decimal.js` or
`big.js`), never casts to JS `number`.

### Banned: `?? 0` numeric fallback for Decimal-null

```typescript
// ❌ Silently masks Decimal null with float zero
const refund = (booking.refundAmount ?? 0) as unknown as number;

// ✅ Explicit null handling, return Decimal
const refund: Prisma.Decimal = booking.refundAmount ?? new Prisma.Decimal(0);
```

The `?? 0` form makes float `0` equivalent to "no refund" — which may be intentional
in the calling code, but losing the Decimal type at this point cascades.

### Cross-path select alignment

When TWO paths read/write the same row (admin + customer, GET + PATCH), their
`select` shapes MUST stay in lockstep. Mark them with a comment that's
greppable on rename/addition:

```typescript
// === DECIMAL_FIELDS_SYMMETRY: keep this select aligned with adminCancelSelect ===
const customerCancelSelect = {
  id: true,
  status: true,
  startTime: true,
  refundAmount: true,
  depositPaid: true, // added 2026-05; mirrored in adminCancelSelect line 84
} satisfies Prisma.BookingSelect;

// === DECIMAL_FIELDS_SYMMETRY: keep this select aligned with customerCancelSelect ===
const adminCancelSelect = {
  id: true,
  status: true,
  startTime: true,
  tenantId: true, // admin needs tenantId for tenancy assertion
  refundAmount: true,
  depositPaid: true, // added 2026-05; mirrored in customerCancelSelect line 76
} satisfies Prisma.BookingSelect;
```

A grep for `DECIMAL_FIELDS_SYMMETRY` surfaces every paired select on rename. The
comment is the source-of-truth that they're related.

A code-review reflex: when you add a new monetary column to a write path, audit
EVERY reader of that table — even if the current diff doesn't touch them.

## Tests

Cross-path symmetry test:

```typescript
it('admin and customer cancel selects share core monetary fields', () => {
  const expected = ['id', 'status', 'startTime', 'refundAmount', 'depositPaid'];
  for (const field of expected) {
    expect(customerCancelSelect[field]).toBe(true);
    expect(adminCancelSelect[field]).toBe(true);
  }
});

it('Decimal arithmetic preserves precision through 1000 ops', () => {
  let total = new Prisma.Decimal(0);
  for (let i = 0; i < 1000; i++) {
    total = total.add('0.01');
  }
  expect(total.toString()).toBe('10.00'); // ← exact, no drift
});
```

## Anti-patterns

- `as unknown as number` cargo-culted across services without thinking
- `?? 0` for monetary null — masks the type
- Two `select` shapes for the same table that drift over time
- Frontend receives `number` for money — JS `number` IS float
- "Decimal is overkill, we deal in cents (integer)" — fine until you add
  percentage tax; integer cents × 0.0825 → float
- "I'll align the selects later" — never happens; the asymmetry waits to bite

## References

- Prisma Decimal: https://www.prisma.io/docs/orm/reference/prisma-client-reference#decimal
- decimal.js (frontend equivalent): https://github.com/MikeMcl/decimal.js
