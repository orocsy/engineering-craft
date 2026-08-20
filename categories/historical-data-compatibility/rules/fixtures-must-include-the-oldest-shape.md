---
title: Fixtures Must Include the Oldest Shape Still in Production
type: guideline
maturity: proven
last-referenced: 2026-08-20
impact: HIGH
impact-description: |
  191 unit tests, a local E2E lane and a disposable-DB suite were green while production was
  empty, because every fixture carried the new field. The suite measured the intended schema,
  not the records that exist.
historical-incidents:
  - 191 unit tests + local E2E + disposable-DB lifecycle all green while production storefront was empty
  - every fixture carried the new slug/pricing fields; production rows had neither
tags: fixtures, testing, historical-data, schema-drift
---

# Fixtures must include the oldest shape still in production

**Impact**: HIGH — a fully green suite that proves nothing about real data.

**Trigger**: adding a field that feels required; writing fixtures for a new content
contract; any "all tests pass" claim about a feature that reads existing records.

## What happened

A new catalog feature was developed against fixtures that all carried the new fields
(`slug`, `pricing`, `priceMode`). Every layer was green:

- 191 unit tests
- a local E2E lane against a seeded database
- a disposable-database admin lifecycle suite

The production storefront was empty the whole time, because production rows have none of
those fields. The tests measured the schema the author intended, not the records that
exist.

## The rule

For every field you add that the UI reads, write **three** fixtures and assert the
user-visible outcome for each:

| Fixture | Represents |
|---|---|
| field present and valid | the new happy path |
| field **absent entirely** | rows written before the field existed |
| field present but blank/whitespace | rows written by a partial migration |

If the outcome for the absent case is "the record disappears", that is a bug, not a
fixture gap.

## Test shape

```ts
test('grid shows every published product, including rows without a slug', () => {
  const markup = renderGrid({
    products: [
      { _id: 'blank-slug', name: 'Blank Slug Product', slug: '   ' },
      { _id: 'legacy', name: 'Legacy Product Without Slug' }, // no slug key at all
    ],
  });
  assert.match(markup, /Legacy Product Without Slug/);
  assert.match(markup, /data-product-card="legacy"/);
  assert.doesNotMatch(markup, /No products/);
});
```

## Cheapest way to get the real shape

Do not guess the legacy shape from memory or from the type definition — the type describes
what you *want*. Read one real record:

```bash
curl -s "$API/api/<collection>?pageSize=1" | jq '.data.items[0] | keys'
```

Copy those keys into the "oldest shape" fixture verbatim.
