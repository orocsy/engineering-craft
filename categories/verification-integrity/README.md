# Verification Integrity

**When this category bites**: something reports green, everyone reads that as "checked",
and it checked nothing. The build is not merely unprotected — it is *confidently*
unprotected, which is worse, because a green signal displaces the suspicion that would
otherwise have prompted a manual look.

**Source incidents**: an SDK contract probe that grepped a whole file and was satisfied by
an unrelated call site; an entitlement E2E that skipped itself exactly when the seeded
account was broken; 38 `as T` casts on unvalidated remote data across four repos; and a
finalize handler that shipped without an atomic claim while its twin in the same file had
one, three separate written rules matched it, and none of them fired.

## The bedrock rule

**A signal is worth only what it costs to make it lie.** If you have never seen a check
fail, you do not know that it can. Before trusting any green:

1. **Break the thing it guards and watch it go red** — that is the only evidence that
   exists. Prefer a DECOY break (leave the token the check searches for satisfiable
   elsewhere) over deleting the line; every check catches deletion, which is precisely why
   blind checks feel trustworthy.
2. **Ask what the check binds to.** A search over a FILE proves nothing about a CALL SITE.
   A type assertion proves nothing about a VALUE. A skipped test proves nothing at all.
3. **Ask what the check is scoped to.** A check scoped to the diff cannot see the family
   the diff joined. Enumerate the family from a surface the machine can walk — the router's
   cases, the workflow's job graph — so inherited code is re-verified on every build.

## Rules in this category

| Rule | Impact | Trigger |
|------|--------|---------|
| [probe-must-fail-on-injected-defect](rules/probe-must-fail-on-injected-defect.md) | CRITICAL | Any `verify-*` script, grep-based scan, or assertion over serialised text — especially one you have never seen fail |
| [exhaustive-registry-beats-diff-review](rules/exhaustive-registry-beats-diff-review.md) | CRITICAL | Adding a new member to a family that already carries an invariant (a new action behind an existing router, a new route serving an existing data class) |
| [skip-is-a-decision-not-a-default](rules/skip-is-a-decision-not-a-default.md) | HIGH | `test.skip`/`describe.skip`/`xit`, and any CI step behind an `if:` that can be false on the shipping trigger |
| [parse-dont-cast-at-trust-boundaries](rules/parse-dont-cast-at-trust-boundaries.md) | HIGH | `as T` on `res.json()`, `JSON.parse`, `localStorage`, webhook bodies, or an untyped SDK return |
| [run-the-composed-gate-not-your-own](rules/run-the-composed-gate-not-your-own.md) | CRITICAL | Running `typecheck && test && lint` by hand instead of the project's composed validate/review command |

## Templates

- [probe-sensitivity.template.mjs](../../templates/probe-sensitivity.template.mjs) — mutation-tests your probes
- [family-registry.template.mjs](../../templates/family-registry.template.mjs) — enumerates a family and requires a per-member decision
- [skip-policy.template.mjs](../../templates/skip-policy.template.mjs) — dated, justified skips only
- [trust-boundary-decoding.template.mjs](../../templates/trust-boundary-decoding.template.mjs) — parse, don't cast

## Anti-patterns

- "The contract probe is green, so the contract holds" → green means the needle was found somewhere, not that the subject is correct
- "I'll skip it when the precondition is missing so CI isn't flaky" → the precondition is missing *because* something broke; you have deleted the alarm
- "It's typed, so it's validated" → `as` is erased at build time and validates nothing
- "The reviewer will catch the sibling" → reviewers read diffs; the sibling is not in the diff
- "Adding the rule to the catalog fixes it" → the rule was already in the catalog; the *trigger* is what failed

## Historical incidents

| Incident | One-line | Rule |
|---|---|---|
| SDK upload-verb probe | whole-file grep satisfied by a different request in the same file | probe-must-fail-on-injected-defect |
| Finalize without a claim | new family member shipped without the family's invariant; three rules matched, none fired | exhaustive-registry-beats-diff-review |
| Entitlement E2E | `test.skip(!login.ok)` — the alarm disarmed by the failure it was watching for | skip-is-a-decision-not-a-default |
| Catalog fetch / session restore | `as ApiEnvelope<T>` / `as SessionUser` on unvalidated bytes | parse-dont-cast-at-trust-boundaries |
