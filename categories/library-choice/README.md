# Library Choice

**When this category bites**: you hand-rolled a regex / parser / date utility / URL
manipulator instead of using the battle-tested library. The library handled edge cases
your hand-roll missed.

**Source incidents**: a real change took 4 rounds of automated review, each catching a
bug from the same meta-anti-pattern: hand-rolled hex color regex, URL host parsing,
YYYY-MM-DD parsing instead of `@IsHexColor()`, `new URL().origin`,
`date-fns-tz/fromZonedTime`.

## Rules in this category

| Rule | Impact | Trigger |
|------|--------|---------|
| [libs-first-no-reinventing](rules/libs-first-no-reinventing.md) | HIGH | About to write regex/parser/date math/URL manipulation |

## Anti-patterns

- "I'll just write a regex for hex color / URL host / YYYY-MM-DD" — battle-tested libs
  handle every edge case
- "The library accepts too much, my regex is more strict" — wrap the lib with a
  narrowing predicate; don't replace
- "I only need the simple case" — codebases grow, simple cases bend
- "It's only 5 lines" — 5 lines of subtle parsing > using a 50-line library function

## Historical incidents

| Incident | One-line | Rule |
|------------|----------|------|
| Hand-rolled parsing | Hand-rolled hex color regex; should have used `@IsHexColor()` from class-validator | libs-first-no-reinventing |
| Hand-rolled parsing | Hand-rolled URL host regex; should have used `new URL(x).origin` | libs-first-no-reinventing |
| Hand-rolled parsing | `parseISO` for date-with-tz; should have used `date-fns-tz/fromZonedTime`. Bug latent on a UTC server; would break any non-UTC deploy | libs-first-no-reinventing |
