---
title: Every Date / parseISO / startOfDay Without Explicit Timezone Uses Host TZ
type: pitfall
maturity: proven
last-referenced: 2026-05-12
impact: HIGH
impact-description: |
  Code "works on UTC EC2" silently breaks for any non-UTC tenant or any developer
  running locally in HKT/PST/etc. Same class of bug recurred at 6 different code
  sites in one production system because no rule said "every time op gets an explicit timezone."
tags: timezone, date-fns, scheduling, server-local, host-invariance
applies-to: |
  Any code that touches user-visible scheduling: availability, calendar boundaries,
  reminders, cross-midnight blocks, time formatting, date parsing of user input.
related-rules:
  - libs-first-no-reinventing
historical-incidents:
  - date-fns parse('HH:mm', date) evaluated in server local TZ; HK 10:00 became 10:00Z, no daytime slots offered
  - parseISO('2026-04-20') produces server-local midnight; latent on UTC EC2, fatal on any non-UTC host (P1 from automated review)
  - getBlocksForDate used server startOfDay/endOfDay while availability used tenant-local bounds; cross-midnight blocks missed; double-booking
  - admin calendar Date#getHours() returned viewer-local hour; bookings vanished from day view at 23:30 HK
  - moved time formatting fully backend-driven via Intl.DateTimeFormat({ timeZone })
  - "TZ=UTC tests" — fake-timer fixtures hid timezone bugs by simulating UTC server output
---

## Why this matters

Six different commits over six months fixed the same class of bug. The root cause is
that every time-related JS function defaults to the host process's `TZ` environment
variable. Production runs on UTC. CI runs on UTC. Developers run locally in their
own TZ. Tenants schedule in THEIR own TZ. Any code path where these don't all
coincide is a latent bug.

The bug is invisible because:
- Tests pass (CI is UTC; tenant assumed UTC)
- Production "works" for UTC tenants
- The first non-UTC tenant or first developer reproducing locally finds it
- Often the discovery is "my booking disappeared at 11:30pm HK time" — hours after
  the deploy

## Banned APIs in scheduling code

| Banned | Reason | Use instead |
|--------|--------|-------------|
| `parseISO('2026-04-20')` | Returns server-local midnight | `fromZonedTime('2026-04-20T00:00:00', tenantTz)` |
| `parse('HH:mm', date, baseDate)` | Server-local interpretation | `parseInTimeZone('HH:mm', wallClock, tenantTz)` (custom helper) |
| `startOfDay(date)` | Server-local boundary | `startOfDayInTimeZone(date, tenantTz)` |
| `endOfDay(date)` | Server-local boundary | `endOfDayInTimeZone(date, tenantTz)` |
| `Date#getHours/Minutes/Day()` | Viewer-local on frontend | Pre-formatted backend string OR `formatInTimeZone(iso, tz, 'HH')` |
| `new Date('2026-04-20')` | Server-local midnight | `fromZonedTime('2026-04-20T00:00:00', tenantTz)` |

## Required reflexes

### Backend formatting is canonical

Every human-facing time string is computed **on the backend** with the tenant's TZ.
Frontend receives strings, never `Date` objects.

```typescript
// ❌ Frontend deciding timezone
const display = format(new Date(booking.startTime), 'HH:mm');

// ✅ Backend pre-formats with tenant TZ
return {
  startTimeDisplay: formatInTimeZone(booking.startTime, tenant.timezone, 'HH:mm'),
  startTimeIso: booking.startTime.toISOString(),
};
```

### Construct absolute times from wall-clock + TZ

```typescript
import { fromZonedTime } from 'date-fns-tz';

// ❌ Server-local midnight — wrong for non-UTC tenants
const dayStart = parseISO('2026-04-20');

// ✅ Tenant-local midnight as an absolute UTC instant
const dayStart = fromZonedTime('2026-04-20T00:00:00', tenant.timezone);
```

### Cross-midnight bounds use tenant TZ

```typescript
// ❌ getBlocksForDate using server startOfDay
const start = startOfDay(date);
const end = endOfDay(date);

// ✅ Tenant TZ
const start = fromZonedTime(`${dateStr}T00:00:00`, tenantTz);
const end = fromZonedTime(`${dateStr}T23:59:59.999`, tenantTz);
// (note: blocks crossing midnight need additional handling — query [start-overlap, end+overlap])
```

### Add a non-UTC test project

```javascript
// jest.config.js
module.exports = {
  projects: [
    { displayName: 'unit', testEnvironment: 'node' },
    {
      displayName: 'tz-hk',
      testEnvironment: 'node',
      globalSetup: '<rootDir>/test/setup-tz-hk.js',
    },
  ],
};
```

```javascript
// test/setup-tz-hk.js
module.exports = () => {
  process.env.TZ = 'Asia/Hong_Kong';
};
```

Run `pnpm test --selectProjects tz-hk` in CI. Any test that relies on host TZ
=== 'UTC' will fail loudly.

### Banned: TZ=UTC test fixtures

Fixtures that simulate UTC server output to make tests pass are **lying**. They
hide bugs that production sees. Replace with the non-UTC test project pattern
above.

## Tests

```typescript
// scheduling.spec.ts — runs in BOTH UTC and Asia/Hong_Kong test projects
describe('availability across midnight (TZ-invariant)', () => {
  it('returns the correct slots regardless of server TZ', async () => {
    const slots = await service.getAvailability({
      date: '2026-04-20',
      tenantTimezone: 'Asia/Hong_Kong',
    });
    expect(slots).toContain('10:00'); // 10am HK time
    // This must pass in both TZ=UTC and TZ=Asia/Hong_Kong test projects
  });
});
```

## Anti-patterns

- "We're a Hong Kong product, all servers are UTC, all tenants are HKT" — until you
  open Singapore tenants
- "I tested it locally" — your local TZ matches the tenant; UTC EC2 doesn't
- "Just use moment" — same problem if you don't pass tz; also moment is deprecated
- "Just store local time strings" — round-tripping through ISO loses the TZ
- "I'll wrap parseISO with a helper that adds 8 hours" — fixes one tenant, breaks
  every other tenant; use proper TZ APIs

## References

- [date-fns-tz](https://github.com/marnusw/date-fns-tz)
- [TC39 Temporal proposal](https://tc39.es/proposal-temporal/) (the future replacement for `Date`)
