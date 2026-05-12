# Time & Timezone

**When this category bites**: scheduling code that "works on UTC EC2" silently breaks for any non-UTC tenant or any developer running locally in HKT/PST/etc.

**Source incidents**: 6 commits across 6 months (aeb6fe5, 22e66c0, 5fc96d7, 95aa55d, c3171ca, 5dd1ede).

## Bedrock rule

**Every `Date`/`parse*`/`startOfDay`/`getHours()` operation without an explicit timezone argument silently uses the host TZ.** Tests on UTC CI hide the bug; production with a non-UTC tenant exposes it. Same class of bug recurred at 6 different code sites in this codebase because no rule said "every time op gets an explicit timezone."

## Rules

| Rule | Impact | Trigger |
|------|--------|---------|
| [server-local-trap](rules/server-local-trap.md) | HIGH | Any code that touches user-visible scheduling, reminders, calendar boundaries, or cross-midnight blocks |

## Anti-patterns

- `parseISO('2026-04-20')` — server-local midnight; latent bug
- `parse('HH:mm', date)` — evaluates in server local TZ
- `startOfDay(date)` / `endOfDay(date)` — server local boundaries
- `Date#getHours() / getDay()` on the frontend → viewer-local; not salon-local
- "Tests pass with `TZ=UTC` jest fixture" — the test is asserting against the bug

## Required reflexes

- Use `formatInTimeZone(iso, tz, fmt)` from `date-fns-tz` for human-facing strings
- Use `fromZonedTime(wallClock, tz)` to construct an absolute instant from a tenant-local wall clock
- Pre-format human-facing time strings backend-side; never let frontend `Intl` decide
- Add a Jest project that runs with `TZ=Asia/Hong_Kong` so CI catches host-invariance bugs

## Related

- [library-choice/libs-first-no-reinventing](../library-choice/rules/libs-first-no-reinventing.md) — `date-fns-tz` is the right lib
