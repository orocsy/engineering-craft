---
title: Library First — Don't Hand-Roll Parsing/Regex/Dates/URLs
last-referenced: 2026-05-12
maturity: proven
type: guideline
impact: HIGH
impact-description: |
  PR#59 had 4 rounds of Codex reviews catching the same meta-anti-pattern: hand-rolled
  parsing for well-studied domains. The libraries exist because the edge cases bite
  every implementer the same way.
tags: library, regex, parsing, date-fns-tz, url, class-validator, hand-rolled
applies-to: |
  About to write a regex, parser, date math, URL manipulation, or any input
  validation/normalization for a well-studied domain.
related-rules: []
historical-incidents:
  - PR#59 (4 rounds: hex color, URL host, parseISO timezone)
---

## Pre-write checklist

Before writing ANY of:
- Regex
- Parser (date, URL, color, email, phone, postal code)
- Date math (timezone, period, comparison)
- URL manipulation (host extraction, query parsing)
- Input validation (format check)

Ask:

1. **Does a battle-tested library function exist?** (Almost always yes for the above)
2. **What does the library accept that I don't want?** (Often the lib is "slightly too
   permissive"; that's fine — wrap with a narrowing predicate)
3. **What does the library reject that I do want?** (If it rejects valid input, then
   compose with a normalizer; don't replace)
4. **Is the env-invariant?** (Some libs depend on `TZ` env var, locale, etc. — test
   under non-default envs)
5. **What does the library do for the edge case that bit me last time?** (Empty input,
   null, leading/trailing whitespace, unicode)
6. **Is there a TypeScript type for the validated form?** (E.g., `URL` class returns
   typed origin/pathname/etc.)

## Concrete substitutions

| Don't write | Use |
|-------------|-----|
| `/^#[0-9a-f]{6}$/i` for hex color | class-validator `@IsHexColor()` |
| `^https?://([^/]+)` for URL host | `new URL(x).origin` or `new URL(x).hostname` |
| `\d{4}-\d{2}-\d{2}` for ISO date | `date-fns/parseISO` (UTC) or `date-fns-tz/fromZonedTime` (with tz) |
| `path.split('/')[2]` for URL path segment | `new URL(x).pathname.split('/')[1]` |
| Email regex | class-validator `@IsEmail()` |
| Phone regex | libphonenumber-js |
| `s.toLowerCase().includes(q.toLowerCase())` | Intl.Collator or fast-levenshtein |
| `new Date(s)` parsing | date-fns/parseISO (deterministic) |
| Manual JWT decode | jsonwebtoken `verify()` (validates signature) |

## Composing libs

When the library default is "almost right but accepts too much":

```typescript
// ❌ REPLACE the library with hand-roll
function isMyFlavorOfHexColor(s: string): boolean {
  return /^#[0-9a-f]{6}$/.test(s); // misses #ABC, #FFFFFF80
}

// ✅ COMPOSE: use the lib for correctness, add a narrowing predicate
import { isHexColor } from 'class-validator';

function isMyFlavorOfHexColor(s: string): boolean {
  if (!isHexColor(s)) return false;          // standard check
  return s.length === 7 && s.toLowerCase() === s; // narrow further
}
```

The composed version inherits the lib's correctness on edge cases (alpha channel,
3-digit shorthand, uppercase) AND adds the project-specific constraint.

## Environment-invariance test requirement

Any function touching dates/times/paths/`process.env` MUST have a test that runs in a
non-default environment:

```typescript
import { parseISO } from 'date-fns';

describe('myDateFunction', () => {
  it('works in Asia/Hong_Kong (HKT, +08:00)', () => {
    jest.replaceProperty(process.env, 'TZ', 'Asia/Hong_Kong');
    expect(myDateFunction('2026-05-11')).toEqual(/* expected */);
  });

  it('works in America/New_York (EST/EDT)', () => {
    jest.replaceProperty(process.env, 'TZ', 'America/New_York');
    expect(myDateFunction('2026-05-11')).toEqual(/* expected */);
  });
});
```

PR#59's `parseISO` bug was latent on the UTC production EC2. It would have broken any
non-UTC deploy. The env-invariance test catches it before that breaks anyone.

## Red-flag phrases (stop and reach for lib)

If you find yourself thinking:
- "I'll just write a regex for…"
- "The library accepts too much…"
- "I only need the simple case…"
- "It's only 5 lines…"
- "The library is overkill for this…"

…STOP. The library exists because the simple case grew. Use it.

## Anti-patterns

- "Reinventing for performance" — the lib is almost always faster (V8 optimizes battle-
  tested code paths)
- "I don't want to add a dependency" — it's already in your dep tree (transitively
  via your framework)
- "The lib has a bug" — file an issue; rolling your own has the SAME bug + new ones
- "Tests pass on my machine" — UTC ≠ HKT; you've tested one env, not "in general"
