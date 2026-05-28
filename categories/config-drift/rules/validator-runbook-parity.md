---
title: Validator Must Accept Every Format the Runbook Recommends
last-referenced: 2026-05-12
maturity: verified
type: pitfall
impact: HIGH
impact-description: |
  Runbook says "set RESEND_FROM_EMAIL to `Name <addr@host>` for nicer display." Validator
  is `z.string().email()`. User follows runbook. Validator rejects. Prod boot fails.
  A real incident caught this; without the automated reviewer it would have been a deploy mystery.
tags: config, env, validator, zod, documentation
applies-to: |
  When you add or change a Zod validator on an env var that has a documented format.
related-rules:
  - four-consumer-rule
historical-incidents:
  - a validator rejecting the display-name email format the runbook recommended
---

## The bug

Two artifacts disagree:
- `apps/api/src/config/env.schema.ts`: `RESEND_FROM_EMAIL: z.string().email()`
- `docs/owner-password-reset/runbook.md`: "Recommended format: `Acme <noreply@...>`"

Result:
- Operator follows runbook → sets `Acme <noreply@...>` in GitHub Secrets
- Container boots → Zod runs → `z.string().email()` rejects `"Acme <noreply@...>"`
  (it's not a valid bare email per RFC 5322 strict)
- Container exits 1
- Operator looks at error: "Invalid email" — runbook says this format works! Confusion.
- Time-to-resolve: minutes-to-hours of frustrated debugging.

## The fix

Change the validator to accept BOTH formats — bare and display-name:

```typescript
const RESEND_FROM_EMAIL_PATTERN = /^.+<([^>]+)>\s*$/;

const envSchema = z.object({
  // ...
  RESEND_FROM_EMAIL: z
    .string()
    .min(1)
    .refine((val) => {
      // Accept bare email
      const bareEmailResult = z.string().email().safeParse(val);
      if (bareEmailResult.success) return true;
      // Accept display-name format: "Name <email@host>"
      const match = val.match(RESEND_FROM_EMAIL_PATTERN);
      if (!match) return false;
      const inner = match[1].trim();
      return z.string().email().safeParse(inner).success;
    }, { message: "Must be a valid email or 'Name <email@host>' format" })
    .optional(),
  // ...
});
```

And add tests for BOTH:

```typescript
describe('RESEND_FROM_EMAIL validator', () => {
  it.each([
    ['bare email', 'noreply@example.com'],
    ['display-name format', 'Acme <noreply@example.com>'],
    ['display-name with quoted name', '"Acme" <noreply@example.com>'],
  ])('accepts %s', (_, value) => {
    expect(envSchema.parse({ ...validBase, RESEND_FROM_EMAIL: value })
      .RESEND_FROM_EMAIL).toBe(value);
  });

  it.each([
    ['empty string', ''],
    ['no @', 'just-a-name'],
    ['display-name with invalid inner email', 'Name <not-an-email>'],
    ['malformed brackets', 'Name <noreply@example.com'],
  ])('rejects %s', (_, value) => {
    expect(() => envSchema.parse({ ...validBase, RESEND_FROM_EMAIL: value })).toThrow();
  });
});
```

## The discipline

When you change ANY validator, search for documented-format references and ensure
parity:

```bash
# Find every place RESEND_FROM_EMAIL is documented with a recommended value
grep -rn "RESEND_FROM_EMAIL" --include="*.md" --include="*.txt" docs/ apps/
```

For each format mentioned, write a test that proves the validator accepts it.

## When to NARROW vs WIDEN the validator

You have two options when validator and docs disagree:

### Widen the validator (preferred when the doc-recommended format is reasonable)

The doc says `Name <email>` is friendlier display in inboxes — that's a legitimate
preference. Widen the validator to accept it.

### Narrow the docs (when the doc-recommended format is wrong)

If the doc recommends a format that's actually unsafe or non-standard, update the doc
to match the validator. But this requires:
- Updating the runbook
- Migrating any existing prod configs that use the old format
- Communicating the change to the team

The runbook update is itself a "consumer" change per
[four-consumer-rule.md](four-consumer-rule.md).

## Anti-patterns

- "It's just docs, no big deal if validator is stricter" — operators follow docs and
  hit cryptic boot errors
- "Display-name format is fancy, let's keep validator strict and update docs" — see
  "narrow the docs" above; you must do the migration work
- "I'll add a transformer that strips display-name format before validation" — fragile;
  changes the value before storage; bad UX (operator sees their input was rewritten)

## Templates

This rule generalizes to anything where documentation describes a format. Examples:

| Documented format | Common validator that misses it |
|-------------------|--------------------------------|
| `Name <email@host>` | `z.string().email()` |
| `re_xxxxx` (Resend prefix) | `z.string().min(20)` |
| `sk_test_...` / `sk_live_...` | `z.string().startsWith('sk_')` |
| `postgres://user:pass@host/db` | URL parsers that don't accept `postgres://` |
| YYYY-MM-DD with timezone suffix | `Date.parse` (varies by Node version) |

For each: the test suite must cover EVERY documented variant.
