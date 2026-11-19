---
title: A Deployed Smoke Asserts the Contract, Not the Inventory
type: pitfall
maturity: proven
last-referenced: 2026-08-20
impact: HIGH
impact-description: |
  A deploy smoke demanded a published product in every family and a slug-bearing product.
  Both were legitimately false, so it blocked deploys on content state — while its own error
  message was production reporting the real defect, which was misread twice.
historical-incidents:
  - smoke demanded a published product in every family; new families ship empty by design
  - smoke demanded a slug-bearing product; its failure was the real defect report, misread twice as a script bug
tags: smoke-test, deploy, contract-vs-inventory, false-blocker
---

# A deployed smoke asserts the contract, not the inventory

**Impact**: HIGH — blocks every deploy on content decisions the smoke has no business
making.

**Trigger**: any deployed smoke that counts rows, requires non-empty collections, or probes
a detail route derived from row data.

## What happened

A deployment smoke was written to prove the new catalog worked end to end. It asserted:

1. **every** product family has at least one published product, and
2. at least one product exposes a slug, so its detail route could be probed.

Both were false in the real environment, for legitimate reasons:

- New families ship as **empty storefronts** until the catalog team publishes into them.
- Every deployed product is a legacy row with **no slug**.

The deploy failed twice on data state, not on defects:

```
Error: ai-gadgets: deployed catalog requires at least one published product
Error: Catalog smoke requires at least one published product slug.
```

## The rule

A smoke proves the **contract**: the route responds, the projection is correct, internal
fields are absent, the release SHA matches. It does not assert how much content exists.

- Check **shape and projection for every entity**, empty or not.
- Gate **non-emptiness behind an explicit allowlist** with a conservative default:
  `SMOKE_REQUIRED_FAMILIES` defaulting to the one family known to be stocked.
- When an optional-field probe has nothing to run against, **say so and continue** rather
  than failing:

```js
if (!detailProduct) {
  console.log('catalog: no published product exposes a slug; skipping slug detail probe');
} else {
  // ...verify the slug detail contract strictly
}
```

## The part that cost the most

The second failure message was production **telling the author** that no product had a
slug — the same fact that was silently emptying the storefront. It was read as a smoke
script problem and patched, twice, before anyone asked why production had no slugs.

**When a check fails because the data "looks wrong", establish whether the data is wrong or
the assumption is.** The smoke is often the first honest witness you have.
