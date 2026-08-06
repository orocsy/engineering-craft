---
title: Single-Use Token Consumption Predicates the Update on `consumedAt: null`
last-referenced: 2026-05-12
maturity: proven
type: guideline
impact: CRITICAL
impact-description: |
  Any "consume once" semantic (reset link, magic link, invite, refund credit) needs the
  consumption gate IN the storage WHERE clause. The flag-on-row pattern with a JS check
  is the canonical TOCTOU bug.
tags: concurrency, cas, prisma, postgres, single-use, token, password-reset, finalize, upload, status-transition
applies-to: |
  ANY one-shot transition — identified by SHAPE, not by field name.

  The original wording of this rule listed vocabulary (`consumedAt`, `usedAt`,
  `redeemedAt`, `spent`, `claimed`) and that is how it failed: a finalize handler spelled
  its one-shot transition as a STATUS ENUM (`pending → active`), matched no listed word,
  and shipped with a JS read-then-write. Match on shape instead:

  > a row may make transition T at most once, two callers can reach the code that performs
  > T, and the write is not predicated on the pre-state.

  Spellings seen in production: `consumedAt`/`usedAt`/`redeemedAt`/`spent`/`claimed`
  flags · `status: pending → active` (upload finalize) · `status: draft → published` ·
  `state: reserved → committed` · "first webhook for this event wins" · "first caller
  under the cap is admitted" · any `finalize`/`complete`/`claim`/`activate`/`settle`
  handler.
related-rules:
  - storage-gate-not-js
  - postgres-optimistic-cas
  - sibling-resource-invariants
  - exhaustive-registry-beats-diff-review
historical-incidents:
  - a real incident: password-reset link consume read `consumedAt` in JS, two concurrent submissions both consumed
  - 2026-08-06 — an upload-finalize handler shipped with `if (doc.status !== 'pending') return CONFLICT`
    followed by an unpredicated `update({ status: 'active' })`, while the sibling finalize path in the
    SAME FILE used an atomic `incrementField(...Claim, 1)` claim. This rule's content covered it; this
    rule's vocabulary-keyed trigger did not fire.
---

## The pattern

```typescript
// ❌ Read-then-update — two concurrent submissions both pass the check
const record = await tx.token.findUnique({ where: { jti } });
if (record.consumedAt !== null) throw new GoneException();
await tx.token.update({ where: { jti }, data: { consumedAt: now } });
```

Race: two concurrent submissions both `findUnique`, both see `consumedAt: null`, both
call `update`. Both succeed. The token is "consumed" twice — meaning whatever the token
authorized (password reset, refund issuance) happens twice.

```typescript
// ✅ Atomic CAS via updateMany with the unconsumed predicate
const result = await tx.token.updateMany({
  where: {
    jti,
    consumedAt: null,                  // ← gate IN the WHERE
    expiresAt: { gt: new Date() },     // ← include expiry in the gate too
  },
  data: { consumedAt: new Date() },
});
if (result.count !== 1) {
  throw new GoneException('Already consumed or expired');
}
```

## Why include `expiresAt: { gt: now }` in the gate

Two reasons:

1. **Same-tx CAS for both flags**: if you check expiry separately in JS (`if (record.expiresAt < now)`),
   you've reintroduced the TOCTOU. Some other writer might extend the expiry (rare but
   possible in some flows), and your stale read would reject a still-valid token.

2. **Single round trip**: `updateMany` evaluates the entire predicate atomically. No need
   for a separate query.

## Sibling tokens — the OTHER thing this rule needs

A user can request multiple reset tokens (multi-tab, browser duplicate, lost-then-found
email). When the user successfully consumes ONE, **all the others must be revoked in the
same transaction**.

```typescript
// In applyPasswordReset, AFTER the user-row CAS update:
await tx.passwordResetToken.updateMany({
  where: { userId, consumedAt: null },
  data: { consumedAt: new Date() },
});
```

Without this: an attacker who intercepted the user's first email can replay that link
AFTER the user successfully resets via the second email, and overwrite the user's
just-set password. This was a real sibling-resource finding.

See [sibling-resource-invariants.md](sibling-resource-invariants.md) for the full pattern.

## Example — 2026-08-06: the same bug wearing a status enum

A media-upload finalize handler, in a repo whose own catalog already documented "CAS claim
before destructive validation":

```typescript
// ❌ Shipped. Structurally identical to the reset-token bug above.
const doc = await get('images', imageId);
if (doc.status !== 'pending') return err('CONFLICT', 'already finalized');   // JS check
const object = await storage.getObjectAsBase64(doc.storageFileId);           // expensive
…
await updateDoc('images', imageId, { status: 'active', byteSize, checksumSha256 });  // unpredicated
```

Two concurrent finalizes both read `pending`, both download the object (a download
amplification vector on its own), and both activate. The `!activated` branch below it
handles a *removed* row — not a *lost race*.

The sibling path in the same file did it correctly:

```typescript
// ✅ The pattern was RIGHT THERE, twelve hundred lines up.
const claim = await incrementField('files', fileId, 'finalizeClaim', 1);
if (claim !== 1) return err('CONFLICT', 'already finalized');   // only the 0→1 winner proceeds
```

Two lessons, and the second is the load-bearing one:

1. A one-shot transition spelled as a status enum needs the same CAS as one spelled as a
   consumed-flag. Where no atomic counter is available, predicate the write:
   `updateMany({ where: { id, status: 'pending' }, data: { status: 'active' } })` and treat
   `count !== 1` as the loser.
2. **Being written down was not enough.** Prose triggered by vocabulary does not fire on a
   synonym, and a rule consulted against the diff never examines the family the diff joins.
   See [exhaustive-registry-beats-diff-review](../../verification-integrity/rules/exhaustive-registry-beats-diff-review.md)
   for the mechanical form: enumerate every dispatchable action and require a per-action
   claimed/unclaimed decision, checked on every build.

## Tests

```typescript
it('two concurrent valid consumes of the same jti — exactly one succeeds', async () => {
  const jti = randomBytes(16).toString('hex');
  await prisma.token.create({ data: { jti, expiresAt: future, consumedAt: null } });

  const [a, b] = await Promise.allSettled([
    service.consume(jti),
    service.consume(jti),
  ]);

  expect(a.status === 'fulfilled' || b.status === 'fulfilled').toBe(true);
  expect(a.status === 'fulfilled' && b.status === 'fulfilled').toBe(false);

  // At-most-one fulfilled, at-least-one fulfilled → exactly one
  const fulfilledCount = [a, b].filter(r => r.status === 'fulfilled').length;
  expect(fulfilledCount).toBe(1);
});

it('consuming a token also revokes sibling tokens for the same user', async () => {
  const linkA = await service.issueLink(userId);
  const linkB = await service.issueLink(userId);

  await service.resetPassword({ token: linkA.token, newPassword: '...' });

  // linkB should now have consumedAt set (revoked as a sibling)
  const linkBAfter = await prisma.passwordResetToken.findUnique({ where: { jti: linkB.jti } });
  expect(linkBAfter?.consumedAt).not.toBeNull();

  // Submitting linkB now must fail
  await expect(service.resetPassword({ token: linkB.token, newPassword: '...' }))
    .rejects.toThrow(GoneException);
});
```
