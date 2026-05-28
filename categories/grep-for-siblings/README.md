# Grep-For-Siblings

**When this category bites**: a security-relevant literal is removed/changed in one
file but lingers in two more. The "fix" is half-applied, leaving the same vulnerability
elsewhere.

**Source incident**: a real review round — the literal `'dev-secret-change-in-production'`
was removed from `auth.service.ts`'s `hashOtpCode`. Background scan caught two more
files (`auth.module.ts`, `jwt.strategy.ts`, plus `booking.service.ts` for a different
literal). The automated reviewer didn't catch it; only a manual sibling-grep did.

## The bedrock rule

**When you make a security-relevant change to ANY single line, grep the repo for the
SAME pattern and apply consistently.**

This applies to:
- Removing a literal-secret fallback (`'dev-secret-change-in-production'`)
- Adding an env-required check
- Renaming a security-relevant function (`hashOtpCode` → `hashOtpCodeSecure`)
- Tightening a validator (URL parser → strict-host check)
- Changing a default config value
- Removing an unsafe default

## Rules in this category

| Rule | Impact | Trigger |
|------|--------|---------|
| [security-literal-grep](rules/security-literal-grep.md) | CRITICAL | Removing/changing any security-relevant literal |
| [api-rename-cross-cut-grep](rules/api-rename-cross-cut-grep.md) | HIGH | Renaming a function/type referenced across modules |
| [payload-shape-drift-against-strict-dto](rules/payload-shape-drift-against-strict-dto.md) | HIGH | Form `{...formState}` spread; regex tightening on legacy persisted values |

## Anti-patterns

- "I'll grep for the literal later" — deferred greps never happen
- "The compiler will catch it" — secrets and dynamic strings are NOT type-checked
- "I'll just fix the one I'm working on" — each unfixed sibling is the same vulnerability

## Historical incidents

| Incident | One-line | Rule that would have prevented it |
|------------|----------|----------------------------------|
| Background-scan find during review | `'dev-secret-change-in-production'` removed in 1 file, present in 3 others | security-literal-grep |
| API rename round | `parseISO` removed in 1 file, called from 6 others (timezone bug) | api-rename-cross-cut-grep |
