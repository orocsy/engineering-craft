---
title: One Record, Many External Fetches — Prepare Off to the Side, Flip One Flag
type: pattern
maturity: verified
last-referenced: 2026-10-12
impact: HIGH
impact-description: |
  A record assembled from several slow or fallible external steps (downloads,
  API calls, conversions) becomes visible half-done, or a later step's failure
  leaves a half-written record behind. Users then work on incomplete data, and
  every consumer has to guess whether "missing" means "failed" or "not yet".
  The store usually cannot hold one transaction across network calls, so the
  atomicity has to come from the shape of the writes, not from the database.
tags: data-pipeline, ingestion, sync, atomicity, transaction, visibility, retry, partial-failure
applies-to: |
  Any job that builds one user-visible record from several external fetches
  (supplier photos, third-party API enrichment, file conversions), especially
  when the database transaction is short or capped (CloudBase: 100 operations,
  no waiting on the network; DynamoDB: 100 items; most serverless stores).
related-rules:
  - failure-classes-and-resumable-retries
  - optional-field-gates-the-record
historical-incidents:
  - channel 2026-10-09 — Alibaba drafts appeared in the admin with no photos; publishing imported photos through the browser (30–80 s per draft, 1–3 s per photo through the CloudBase gateway) and refused drafts that had 19 description photos; the owner had to click "Import gallery" by hand (P0, commits f90363c, d54b027)
  - channel 2026-10-09 — first copy-ahead job (609b362) saved whatever copied and retried the rest "after a day"; drafts showed with some photos missing; owner — "see a product's everything as a whole, success then all should success, fail then all fail and retry later, but don't affect later other products"
  - channel 2026-10-09 — review of the fix (5fd7752) found a P1 — a hidden draft approved before its photos landed stayed hidden forever because the job's guarded save refused anything that was no longer a draft (fixed 8cca888)
---

## Symptom

Records show up incomplete (a product without its photos), users get errors at
the moment they act on them ("import photos first"), or a record is complete
in one place and incomplete in another. The owner of the data asks why a
manual step exists at all.

## Wrong mental model

"The record's fields and its media are separate concerns. Sync the fields now,
attach the media when someone needs it, patch failures later." It is plausible
because the two come from different systems at different speeds, and the code
already had separate "import gallery" and "import description photos" actions.
It ignores the business rule: the product is **one unit**, approved once,
photos included. And "later" means a person sees and acts on the half-done
version in between.

## How we found out

- The owner's description of the business rule (one approval covers the
  product and everything in it).
- Measured costs made "do it at publish time" impossible to make fast: 11,180
  photo sources over 957 drafts; 1–3 s per photo through the gateway.
- A data scan: 208 drafts had more than 18 description photos (the per-record
  limit), so "copy at publish" would also fail on limits in front of the user.

## Options considered

1. **One database transaction for fields and media.** Rejected: a download
   takes seconds; the store's transactions are short, capped at 100
   operations, and cannot wait on the network.
2. **Fetch at the moment of use (publish).** Rejected: slow, fails in front
   of the user, and makes media a reason the main action can fail.
3. **Copy ahead, save what succeeded, retry the rest later.** Built first,
   then rejected: users see half-ready records; "later" was a day.
4. **Copy everything off to the side, then one guarded write that sets the
   fields, the ownership marker and the visibility flag together.** Chosen.

## Incorrect

```typescript
// ❌ Saves whatever copied; the record becomes visible with holes in it.
for (const part of plan.parts) {
  const states = await copySources(part.sources);
  const ids = states.filter(isCopied).map((s) => s.imageId);
  if (ids.length > 0) data[part.field] = ids;
  marker[part.part] = { sources: part.sources, imageIds: ids, missing: failedOf(states) };
}
await saveProduct(product._id, { ...data, autoPhotos: marker });
// failed photos retried "after a day"; meanwhile the draft is in the admin list
```

## Correct

```typescript
// ✅ Created hidden: the sync writes new drafts with photosPending: true, and
//    every admin list and count filters hidden records out.

// 1. Copy everything first. Nothing about the record is written yet.
//    (Copied bytes and failure notes are written — they are reusable side
//    state, not the record.)
const copied: { part: Part; states: CopiedState[] }[] = [];
for (const part of plan.parts) {
  const states = await copySources(part.sources); // { imageId } | 'unusable' | 'waiting'
  if (states === null) return 'out-of-time';       // resume this record next call
  copied.push({ part, states });
}

// 2. Any passing failure: this record waits; the loop moves to the next record.
if (copied.some(({ states }) => states.includes('waiting'))) return 'waiting';

// 3. One guarded write is the commit point: fields + marker + visibility.
const result = await saveCatalogProductWithIdentities({
  mode: 'update',
  productId: product._id,
  data: { ...fieldsFrom(copied), autoPhotos: markerFrom(copied), photosPending: false },
  expectedUpdatedAt: product.updatedAt, // nobody edited it meanwhile
  requireUnapprovedDraft: true,         // approval writes do not bump updatedAt
  expectedAlibabaIdentity: identityOf(product),
});
if (result.result === 'stale') return 'busy'; // looked at again next pass
```

```typescript
// ✅ The escape hatch the review found missing: a record that stopped being a
//    draft while hidden (approved, published, archived, unlinked) only gets its
//    flag cleared, with a one-field write that does not re-validate the record.
if (!eligible(product)) {
  await updateDoc('products', product._id, { photosPending: false });
  return 'prepared';
}
```

Rules that make the flip safe:

- **Exactly one writer clears the flag**, and only in the same write that
  completes the record.
- **Something sets the flag back** when the inputs change under a record that
  is still the sync's own (`photosRefresh`: a sync that brings new photo
  sources for an untouched draft hides it again until they are copied).
- **Every reader that lists records filters the flag.** Add it to the shared
  list option (`hidePreparing`), not to each screen.
- **Nothing can stay hidden forever.** Every state the record can reach while
  hidden needs a path that clears the flag (the P1 above).

## Tests

```typescript
it('a passing failure writes nothing and the next record still saves', async () => {
  const store = { products: [draft('a', { photosPending: true }), draft('b')] };
  const page = await prepareAlibabaPhotosPage({ importImage: failing(['a-g2']) });
  assert.equal(page.waiting, 1);
  assert.equal(page.prepared, 1, 'the other record is not held up');
  assert.equal(product('a').imageIds, undefined, 'nothing saved for a');
  assert.equal(product('a').photosPending, true, 'still hidden while incomplete');
});

it('a record approved or published while hidden is shown again', async () => {
  for (const state of [{ published: true }, { approvalReceipt: {} }, { archived: true }]) {
    const page = await prepareAlibabaPhotosPage({ /* hidden record in `state` */ });
    assert.equal(product('a').photosPending, false);
    assert.equal(product('a').imageIds, undefined, 'its photos are not touched');
  }
});

it('a source change the job would not act on does not hide the record', () => {
  // only past the first 9 photos, or http → https of the same photo
  assert.deepEqual(photosRefresh(filled, { sources: [...nine, extra] }), {});
});
```

## Pattern name and triggers

**"Prepare off to the side, flip one flag."** Reach for it when you see:
*import, sync, ingest, copy media, enrich, multi-step job, partial failure,
half-ready, retry later, "can't use a transaction", serverless store,
background job feeding an admin list.*

## Still uncertain

- Retries only run when someone opens the page that starts the job (no timer),
  so "retry later" depends on use. A scheduled tick would remove that.
- The visibility flag is a second source of truth next to `published`; a new
  list that forgets the shared filter would show half-ready records. A parity
  test over all list call sites would close it.
