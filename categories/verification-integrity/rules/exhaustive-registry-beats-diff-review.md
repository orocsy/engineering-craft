---
title: Enumerate the Family in Code — Sibling Rules Must Fire on ADDITION, Not Only on Change
last-referenced: 2026-08-06
maturity: proven
type: process
impact: CRITICAL
impact-description: |
  Every sibling-sweep rule in this repo is triggered by a SUBTRACTIVE edit — "when you
  remove a literal", "when you rename a function". None of them fires when you ADD a new
  member to a family whose existing members carry an invariant. That is the gap through
  which a finalize handler shipped with no single-winner claim while its twin, in the same
  file, had one — and the pattern was already written down in two catalogs.
tags: process, siblings, checklist-design, trigger-scope, registry, exhaustiveness
applies-to: |
  Any invariant carried by a FAMILY of code paths rather than by one path: dispatchable
  actions behind one router, routes serving one data class, handlers verifying one token
  class, jobs writing one shared target, components in one widget family, migrations
  touching one table.
related-rules:
  - probe-must-fail-on-injected-defect
  - security-literal-grep
  - api-rename-cross-cut-grep
  - sibling-resource-invariants
  - storage-gate-not-js
historical-incidents:
  - a real incident: an upload-finalize action shipped with a JS read-then-write instead of
    an atomic claim. The sibling finalize path in the SAME FILE used an atomic claim; the
    project catalog documented the pattern citing that sibling; the cross-project catalog
    carried a rule whose `applies-to` matched the defective code shape verbatim. An
    external reviewer found it anyway.
  - the same review round: 10 further findings in one repo were all "a control landed on
    one path, its structural twin shipped without it"
---

## Why the existing rules did not fire

Three defenses existed, and each missed for a different reason. The reasons matter more
than the incident.

| Defense | Its stated trigger | Why it stayed silent |
|---|---|---|
| `storage-gate-not-js` | *"Any code shaped like `const x = await read(); if (x.flag) throw; await update(x, …)`"* | The `applies-to` matched the defective code **verbatim** — but `applies-to` lives INSIDE the rule file, and the only mechanical routing surface (the INDEX trigger table) is keyed on vocabulary: `forgot-password, otp, jwt, session, tokenVersion`. `completeUpload`, `status: pending → active` matches no row. To find the rule you had to already suspect the rule. |
| `single-use-token-consumption` | *"Any `consumedAt`/`usedAt`/`spent` flag"* | Vocabulary trigger. This one-shot transition was spelled as a **status enum**, not a consumed-flag. Same semantics, no lexical overlap. |
| project catalog: *"CAS claim before destructive validation"* | prose in `docs/ENGINEERING_CRAFT.md` | Correct, specific, and cited the sibling that had it. Nothing forces you to open a doc while writing a handler. |

The common failure is not that the rules were wrong. **It is that all three were scoped to
the diff, and keyed to words.** The defective code was a NEW member of an existing family;
it removed nothing, renamed nothing, and used none of the trigger vocabulary.

## The rule

A sibling-sweep obligation has **two directions**, and the catalog historically encoded
only one:

- **Subtractive (already covered)** — *I changed/removed X here → find the other X's.*
  See `security-literal-grep`, `api-rename-cross-cut-grep`.
- **Additive (the gap)** — *I added a new member of family F → enumerate F's existing
  members, list the invariants they carry, and either carry each one or record why not.*

And the scope is **every surface the change TOUCHES OR DEPENDS ON**, not the lines it
adds. A new action behind an existing router depends on that router's whole contract.

## Make it mechanical, or it will not fire

A checklist question is consulted by whoever remembers to consult it, against whatever
they happen to consider "the change". The reliable form of the additive trigger is an
**exhaustive registry**: enumerate the family in code and require a classification for
every member, so that adding a member without deciding breaks the build.

```jsonc
// action-claims.json — every dispatchable action, classified.
{
  "claimed": {
    "resetPassword":  "incrementField(passwordResets, consumeClaim) — consume-once",
    "finalizeOemFile": "incrementField(files, finalizeClaim) — single-winner"
  },
  "unclaimed": {
    "listImages": "read-only",
    "createIntent": "insert-only"
  }
}
```

```javascript
// The gate: enumerate from the DISPATCHER, not from the diff.
const actions = [...source.matchAll(/case '([A-Za-z0-9_]+)':/g)].map((m) => m[1]);
for (const action of actions) {
  if (!(action in claimed) && !(action in unclaimed)) {
    fail(`${action} is dispatchable but unclassified — two concurrent callers can reach it
          and nothing on record says whether that is safe`);
  }
  if (action in claimed && !hasClaimPrimitive(bodyOf(action))) {
    fail(`${action} is declared claimed but its handler contains no atomic primitive —
          the registry has drifted from the code, which reads as verified`);
  }
}
```

Three properties make this work where prose did not:

1. **It is keyed to a SHAPE the machine can enumerate** (every `case` in the router), not
   to words a human must recognise.
2. **It re-checks the whole surface on every build**, so an invariant is re-asserted for
   handlers the diff never touched. Nobody has to notice they created a sibling.
3. **Its failure names the missing decision**, not a style violation — so the fix is a
   judgement recorded in the registry, and "unclaimed: read-only" is an acceptable,
   auditable answer.

Applied to the incident's repo, the gate reported **27 dispatchable actions with no
concurrency classification at all** — the external review had found one.

## The general move

> When you find that a rule existed and still did not fire, the fix is almost never to
> restate the rule. It is to move the trigger from **vocabulary a human must match** to a
> **surface a machine can enumerate**, and from **the diff** to **the family the diff
> joins**.

## Executable gate

[`family-registry.template.mjs`](../../../templates/family-registry.template.mjs) — enumerates
a family from its dispatch site, requires every member to be classified in a registry, and
verifies claimed members actually carry the primitive (walking one or two call levels deep,
so a handler that delegates its CAS to a helper is not falsely accused).

## See also

- [probe-must-fail-on-injected-defect](probe-must-fail-on-injected-defect.md) — the registry is itself a probe; prove it fails
- [round-cascade-and-deferred-p2](../../review-discipline/rules/round-cascade-and-deferred-p2.md) — sibling findings are the main driver of extra review rounds
