---
title: A Skipped Test Is a Decision With an Owner and an Expiry — Never a Default
last-referenced: 2026-08-06
maturity: proven
type: guideline
impact: HIGH
impact-description: |
  A suite reports green three ways and only one of them means the code works: the test ran
  and passed, the test was hard-disabled, or the test skipped because a precondition was
  missing. The third is the dangerous one — the skip is MOST likely exactly when the
  environment is broken, so a real regression presents as a pass.
tags: testing, ci, skip, false-green, e2e, coverage
applies-to: |
  `test.skip` / `it.skip` / `describe.skip` / `xit` / `@Disabled` / `t.Skip()` /
  `pytest.mark.skip`, and every workflow step guarded by an `if:` that can evaluate false
  on the path that actually ships.
related-rules:
  - probe-must-fail-on-injected-defect
  - selector-coupling-and-blast-radius
  - workflow-chain-coverage-and-gotchas
historical-incidents:
  - a real incident: an entitlement E2E carried `test.skip(!loginBody.ok || !token, 'seeded
    member account unavailable')`. A broken seed — or broken login — silently removed the
    assertion instead of failing it.
  - the same suite: a test hard-disabled "until the upload MIU lands" stayed disabled for
    months, permanently green with zero coverage, until an external reviewer noticed.
  - the same repo: the media-upload and OEM-upload smokes only ran on `workflow_dispatch`
    with an explicit boolean input, so the push path that actually deployed never ran them.
---

## The pattern

`test.skip(condition, reason)` reads like defensive hygiene: *"if the precondition isn't
there, don't fail spuriously."* But look at what the condition usually is —

```typescript
// ❌ The predicate is TRUE precisely when something is wrong.
const loginBody = await login('member@example.com');
test.skip(!loginBody.ok || !token, 'seeded member account unavailable in this environment');
expect(await vipPriceVisible()).toBe(true);   // ← silently not asserted
```

If login breaks, the seed is dropped, or the account is suspended, this test does not go
red. It goes **green, with the assertion removed**. The signal you built to detect that
class of breakage is disarmed by that exact breakage.

Hard skips fail differently but just as quietly:

```typescript
// ❌ Permanently green, zero coverage, no expiry, no owner.
test.skip('admin-created published product appears in the public catalog', async () => { … });
```

## The rule

A skip is a decision. Decisions have a **reason**, an **owner**, and an **expiry**. Encode
all three next to the skip, and make CI enforce that they exist.

```typescript
// ✅ Hard skip: dated, so it cannot outlive its justification.
// @skip-until 2026-09-30 — blocked on the upload-broker MIU; re-enable when completeUpload lands
test.skip('admin-created published product appears in the public catalog', async () => { … });

// ✅ Conditional skip: says which environment may legitimately lack this, and what covers it there.
// @skip-when running locally without a seeded DB; the deploy-smoke lane covers this in CI
test.skip(!process.env.LOCAL_DB, 'no local database');

// ✅ In an environment that is SUPPOSED to provide the precondition, assert — do not skip.
if (process.env.CI) {
  expect(loginBody.ok, 'seeded member account must exist in CI').toBe(true);
} else {
  test.skip(!loginBody.ok, 'no seeded member account locally');
}
```

That last shape is the important one. **The same missing precondition is a legitimate skip
locally and a hard failure in CI.** Collapsing both into one unconditional skip is what
turns a broken environment into a green build.

## Workflow-level skips are the same defect

A step guarded by `if: github.event.inputs.run_smoke == 'true'` does not run on `push`. If
`push` is the trigger that deploys, the deploy path has no smoke coverage — and the run is
green, with a tick beside a step that never executed. Enumerate, per trigger, which
verification steps actually execute; a step that never runs on the shipping path is
decoration.

## Tests

```typescript
it('the entitlement spec fails (not skips) when the seeded account is missing', async () => {
  await withSeedRemoved(async () => {
    const result = await runSpec('entitlement.spec.ts', { env: { CI: 'true' } });
    expect(result.status).toBe('failed');      // ← not 'skipped'
  });
});
```

## Executable gate

[`skip-policy.template.mjs`](../../../templates/skip-policy.template.mjs) — fails the build on
a hard skip with no `@skip-until` (or an expired one), on a conditional skip with no
`@skip-when`, and on any conditional skip whose predicate reads an env var the CI config
declares it provides.

## See also

- [probe-must-fail-on-injected-defect](probe-must-fail-on-injected-defect.md) — the other way a green check is not checking
- [workflow-chain-coverage-and-gotchas](../../deploy-delivery/rules/workflow-chain-coverage-and-gotchas.md)
