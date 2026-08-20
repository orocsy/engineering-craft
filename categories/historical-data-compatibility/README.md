# Historical Data Compatibility

**When this category bites**: a feature ships green on every test, then a production
storefront renders empty; a "frontend-only" change with no API or schema edit silently
hides real records; a smoke test blocks every deploy demanding data that legitimately does
not exist yet.

**Source incidents**: 2 features, 4 commits.

## Bedrock rule

**Records in production are OLDER than the schema you are writing against. Optional fields
are optional forever. A client-side filter over server data is a silent data-loss gate: if
the server says a record is published, the UI degrades the FEATURE, never the RECORD.**

## Rules

| Rule | Impact | Trigger |
|------|--------|---------|
| [optional-field-gates-the-record](rules/optional-field-gates-the-record.md) | CRITICAL | Any list/grid that filters server results; any journey routed through a field added after launch |
| [fixtures-must-include-the-oldest-shape](rules/fixtures-must-include-the-oldest-shape.md) | HIGH | Adding a field that feels required; writing fixtures for a new content contract |
| [smoke-asserts-contract-not-inventory](rules/smoke-asserts-contract-not-inventory.md) | HIGH | Any deployed smoke that counts rows, requires non-empty collections, or probes a detail route |

## Anti-patterns

- `items.filter(hasNewField)` in a list component — deletes valid records with no error
- A detail route resolvable ONLY by a field added after launch (`slug`, `handle`, `seoId`)
- Every fixture in a new suite carrying the new field — the suite proves the author's
  imagination, not the database
- A deployed smoke asserting "at least one row in every category" — blocks deploys on
  content decisions
- Reasoning "the API didn't change, so this is low risk" — risk follows the ASSUMPTIONS a
  change introduces, not the layer it edits

## The tell you will ignore

Production usually announces this failure before your users do, in a message that sounds
like a tooling problem. `Catalog smoke requires at least one published product slug` was
production stating plainly that no product had a slug — read as a broken smoke script, not
as proof the UI's core assumption was false. When a check fails because data "looks wrong",
ask whether the DATA is wrong or the ASSUMPTION is.
