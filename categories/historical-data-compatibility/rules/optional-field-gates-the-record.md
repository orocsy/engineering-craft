---
title: An Optional Field Must Never Gate the Record
type: pitfall
maturity: proven
last-referenced: 2026-08-20
impact: CRITICAL
impact-description: |
  A catalog grid filtered by a slug added after launch. Every deployed row predated it, so
  the storefront rendered "No products match" while the API returned four published products,
  and no product had a detail page. No error, no 500 — a silent data-loss gate.
historical-incidents:
  - catalog grid filtered by slug; 4 published products rendered as "No products match"
  - detail journey routed only through ?slug=; no deployed product had a slug, so no product had a detail page
  - empty state made "everything discarded" indistinguishable from "nothing published"
tags: historical-data, optional-fields, silent-failure, projection, legacy-rows
---

# An optional field must never gate the record

**Impact**: CRITICAL — valid, published records disappear from production with no error.

**Trigger**: any list/grid that filters server results; any user journey routed through a
field introduced after launch.

## What happened

A catalog redesign introduced `slug` for SEO-friendly detail URLs. The new grid rendered:

```tsx
const linkedProducts = state.products.filter(hasUsableCatalogSlug);
```

and the detail page resolved by slug only (`fetchProductBySlug`). Every product in the
deployed database was a legacy row created before slugs existed. Result:

- The storefront rendered **"No products match these filters"** while the API returned
  **HTTP 200 with four published products**.
- **No product on the site had a detail page at all** — the entire detail journey was
  unreachable for real data.

Nothing errored. No 500, no console error, no alert. The empty state made "everything was
discarded" look identical to "nothing is published".

## Why it survived review and CI

The change touched no API, no schema, and no migration, so it was reasoned about as
low-risk "frontend-only" work. 191 unit tests, a local E2E lane, and a disposable-database
lifecycle suite were all green, because every fixture written for the feature carried a
slug.

## The rule

1. **Render what the server returns.** If the server says a record is published, the UI
   does not get to decide it does not exist.
2. **Degrade the feature, not the record.** No slug ⇒ render the card, omit the link.
3. **Key core journeys on a field that always exists.** The detail band was restored as an
   in-page expansion keyed by `product._id`, which every record has.
4. **Treat a client-side filter over server data as a data-loss gate** and justify it in
   review the way you would justify a `DELETE`.

## Fix shape

```tsx
// Render every product; the optional field only decides whether we can link out.
const products = state.products;
const slug = hasUsableCatalogSlug(product) ? product.slug.trim() : null;
return slug
  ? <a href={`/products/item/?slug=${encodeURIComponent(slug)}`}>{body}</a>
  : <div>{body}</div>;
```

## Verification that actually proves it

Query production for the real payload shape and feed THAT to the component — not a fixture:

```bash
curl -s "$API/api/products?productFamily=headphones" | jq '.data.items[0] | keys'
# ["_id","category","description","images","modName","moq","name","published","unitPrice",...]
# note: no "slug", no "pricing"
```

Then assert the user-visible outcome: `4 products` rendered, not `No products match`.
