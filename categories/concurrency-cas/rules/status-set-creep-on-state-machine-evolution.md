---
title: Status Predicates Use Allow-Lists, Never Negation Chains
type: pitfall
maturity: verified
last-referenced: 2026-05-12
impact: HIGH
impact-description: |
  Predicates expressed as denylist (`status !== 'CANCELLED' && status !== 'COMPLETED'`)
  silently include any new status added later. Adding `IN_PROGRESS` as a state silently
  broke 3 unrelated UI/notification surfaces because none used an allow-list.
tags: state-machine, status, enum, denylist, allowlist, eslint
applies-to: |
  Every status / state predicate. Every conditional UI/notification gated on a status
  field. Every `if (booking.status !== 'X')` in the codebase.
related-rules:
  - state-machine-first
historical-incidents:
  - a3b6fcf — QR card rendered for "non-terminal" bookings including PENDING; should have been allow-list of {CONFIRMED, CHECKED_IN, IN_PROGRESS}
  - c3171ca — deriveOperationalFlags LATE_NO_CHECKIN polluted by PENDING bookings whose scheduled time passed (never confirmed → false alert)
  - 6dcbf61 — admin Reschedule menu item showed for IN_PROGRESS even though executeRescheduleCore rejects them; Complete missing for IN_PROGRESS
  - 9a355d5 — reminders for PENDING reschedules; unsent reminders should be CLEARED, not synced
---

## Why this matters

A denylist predicate (`status !== 'CANCELLED' && status !== 'COMPLETED'`) is a
**negative-space definition**. It silently includes:
- Every status that exists today and isn't in the denylist
- Every status added in the future

When you add `IN_PROGRESS` to the enum, you have to grep for every
`status !== 'X'` in the codebase and decide if `IN_PROGRESS` belongs in or out.
You will miss some. PR#85 missed 3 surfaces: QR card rendering, LATE_NO_CHECKIN
flags, Reschedule menu item.

## Incorrect — denylist drift

```typescript
// ❌ "Show QR card for active bookings"
const showQR = booking.status !== 'CANCELLED' && booking.status !== 'COMPLETED';
// ↑ Includes PENDING (no QR yet — confirmation hasn't issued one)
//                  IN_PROGRESS (QR already used)
//                  whatever-new-status-we-add-next

// ❌ "Show Reschedule menu item for non-terminal bookings"
const showReschedule = !['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(booking.status);
// ↑ Includes IN_PROGRESS (executeRescheduleCore throws for these)

// ❌ "Mark LATE_NO_CHECKIN if scheduled time passed and booking isn't done"
if (booking.scheduledTime < now && booking.status !== 'COMPLETED' && booking.status !== 'CANCELLED') {
  flags.push('LATE_NO_CHECKIN');
}
// ↑ Fires for PENDING bookings (never confirmed; shouldn't be flagged late)
```

## Correct — allow-list with named predicate

```typescript
// ✅ Single source of truth, typed against the enum
import { BookingStatus } from '@prisma/client';

const QR_ELIGIBLE_STATUSES = ['CONFIRMED', 'CHECKED_IN'] as const satisfies readonly BookingStatus[];
const RESCHEDULABLE_STATUSES = ['PENDING', 'CONFIRMED'] as const satisfies readonly BookingStatus[];
const LATE_FLAGGABLE_STATUSES = ['CONFIRMED'] as const satisfies readonly BookingStatus[];

export function isQrEligible(s: BookingStatus): boolean { return QR_ELIGIBLE_STATUSES.includes(s); }
export function isReschedulable(s: BookingStatus): boolean { return RESCHEDULABLE_STATUSES.includes(s); }
export function isLateFlaggable(s: BookingStatus): boolean { return LATE_FLAGGABLE_STATUSES.includes(s); }

// All consumers:
const showQR = isQrEligible(booking.status);
const showReschedule = isReschedulable(booking.status);
if (booking.scheduledTime < now && isLateFlaggable(booking.status)) {
  flags.push('LATE_NO_CHECKIN');
}
```

When `IN_PROGRESS` is added to the `BookingStatus` enum:
- `as const satisfies readonly BookingStatus[]` doesn't change (allow-list is closed)
- `IN_PROGRESS` is NOT in any allow-list by default — safe default
- TypeScript surfaces `IN_PROGRESS` as a NEW case wherever an exhaustive switch is used:

```typescript
function statusLabel(s: BookingStatus): string {
  switch (s) {
    case 'PENDING':     return 'Pending';
    case 'CONFIRMED':   return 'Confirmed';
    case 'CANCELLED':   return 'Cancelled';
    case 'COMPLETED':   return 'Completed';
    case 'NO_SHOW':     return 'No-show';
    // ts(2366) error: not all code paths return — IN_PROGRESS unhandled
  }
}
```

The TS exhaustiveness check forces the developer to acknowledge the new status
and decide whether each predicate should include it.

## ESLint rule (planned, optional)

A custom rule could ban `status !==` and `!STATUSES.includes(status)` chains
in code that touches business logic:

```javascript
// .eslintrc.js
'engineering-craft/no-status-denylist': {
  message: 'Use allow-list predicate (e.g. isQrEligible(status)) instead of negation chain',
  patterns: [
    'status !== "X"',
    'status !== "X" && status !== "Y"',
    '!STATUSES.includes(status)',
  ],
}
```

## Tests

For every named predicate, test both allow + deny:

```typescript
describe('isQrEligible', () => {
  it.each(['CONFIRMED', 'CHECKED_IN'] as const)('allows %s', (s) => {
    expect(isQrEligible(s)).toBe(true);
  });
  it.each(['PENDING', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'IN_PROGRESS'] as const)('denies %s', (s) => {
    expect(isQrEligible(s)).toBe(false);
  });
});
```

When `BookingStatus` enum gains a new value, this test forces a decision: add to
allow OR add to deny. The compiler error from `as const satisfies` forces the
update.

## Anti-patterns

- `status !== 'X'` — denylist creep
- `!['X', 'Y'].includes(status)` — same problem, harder to spot
- "I'll grep when we add a new status" — see PR#85: 3 surfaces missed
- Inlining the predicate at every call site — diverges over time
- Boolean column on the row (`isCancelled`) — adds storage, doesn't enforce the
  full state machine
