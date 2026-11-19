---
title: `as T` on Remote Data Is a False Green From the Compiler
last-referenced: 2026-08-06
maturity: proven
type: guideline
impact: HIGH
impact-description: |
  `await res.json() as Body` compiles, reads as typed, and checks nothing at runtime. Every
  downstream line then treats unvalidated remote bytes as a known shape, so the first
  symptom is a TypeError in a consumer, far from the boundary that let the value in, in a
  stack that names the victim rather than the source.
tags: typescript, validation, trust-boundary, json, zod, dto, contract
applies-to: |
  Any value entering the program from outside it, given a type by assertion rather than by
  validation: `res.json()`, `JSON.parse`, `localStorage`/`sessionStorage`, message-queue
  payloads, webhook bodies, `process.env` narrowed to a union, DB rows from an untyped
  driver, and SDK return values typed by a hand-written stub.
related-rules:
  - probe-must-fail-on-injected-defect
  - payload-shape-drift-against-strict-dto
  - empty-string-vs-undefined-and-five-surface-rule
historical-incidents:
  - a real review round: an `as` cast on a fetch envelope was paired with a client DTO
    declaring fields the server never sends — consumers were typed against values that were
    `undefined` at runtime in every environment
  - a sweep across four repos found 38 unvalidated boundary casts, including session
    restoration from `localStorage` and every catalog fetch on the storefront
---

## Why this belongs with false greens

A passing probe, a skipped test, and an `as` cast fail the same way: **each produces a
signal that is read as verification and is not one.** `as` is the purest form — it is
erased at build time, so the "check" has no runtime existence at all. The type system
reports confidence proportional to what you asserted, not to what arrived.

The asymmetry that makes it dangerous: a *wrong* cast and a *right* one look identical in
review, in the editor, and in CI. Only production distinguishes them.

## Incorrect

```typescript
// ❌ The compiler now believes this. Nothing else does.
const json = (await res.json()) as ApiEnvelope<CatalogPage>;
render(json.data.items);           // TypeError here when the server renames `items`

// ❌ Same defect, stored data. A schema change two releases ago poisons this forever.
return JSON.parse(raw) as SessionUser;
```

## Correct

```typescript
// ✅ Decode to `unknown`, then validate. The type is EARNED, not asserted.
const CatalogPage = z.object({
  ok: z.literal(true),
  data: z.object({ items: z.array(ProductSchema), total: z.number().int().nonnegative() }),
});

const parsed = CatalogPage.safeParse(await res.json());
if (!parsed.success) {
  // A boundary failure is an OPERATIONAL event: log it with the endpoint, and fail here
  // rather than three frames away.
  logger.error({ endpoint, issues: parsed.error.issues }, 'catalog response failed contract');
  throw new ContractError('catalog');
}
render(parsed.data.data.items);
```

`as unknown` is the correct first step and is explicitly fine — it forces the parse. What
is not fine is `as <ConcreteType>`.

## The DTO half of the same bug

A client type that declares fields the server never sends is the mirror image: the cast
makes the compiler agree, and the field is `undefined` in every environment. Derive the
client type FROM the server's response projection (shared schema package, generated
client, or a single zod schema imported by both), so a field that the server withholds
cannot be declared on the client at all.

## Tests

```typescript
it('rejects a response missing a required field instead of returning a half-object', async () => {
  fetchMock.mockResolvedValue(json({ ok: true, data: { total: 3 } }));   // `items` withheld
  await expect(loadCatalog()).rejects.toThrow(ContractError);
});

it('rejects a stored session whose shape predates the current schema', () => {
  localStorage.setItem('session', JSON.stringify({ id: 'u1' }));         // no `role`
  expect(restoreSession()).toBeNull();
});
```

## Executable gate

[`trust-boundary-decoding.template.mjs`](../../../templates/trust-boundary-decoding.template.mjs)
— fails on any `as <Type>` (other than `as unknown` / `as const` / `as any`) applied to a
boundary-crossing expression, with an `// @unvalidated-ok: <reason>` escape hatch so a
deliberate exception is a recorded decision rather than an invisible one.

## See also

- [payload-shape-drift-against-strict-dto](../../grep-for-siblings/rules/payload-shape-drift-against-strict-dto.md) — the outbound direction of the same seam
- [skip-is-a-decision-not-a-default](skip-is-a-decision-not-a-default.md)
