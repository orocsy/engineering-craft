---
title: E2E Selectors Couple to Rendered Shape — Treat Renames as Repo-Wide Greps
type: pitfall
maturity: proven
last-referenced: 2026-05-12
impact: HIGH
impact-description: |
  An unrelated PR renames a label/role/test-id. 4 E2E specs break at once with cryptic
  Playwright timeouts. The fix is "update selectors" but the same class of bug recurs
  every 2-3 weeks because no rule enforces the cross-cut search.
tags: e2e, playwright, selectors, resilience, blast-radius
applies-to: |
  Any rename of a label, role, copy string, or test-id; any new dual-lane (responsive
  desktop+mobile) component; any field split (e.g. phone → country + national-number);
  any framework upgrade that changes batching behavior.
related-rules:
  - api-rename-cross-cut-grep
  - tx-rollback-contract-layers
historical-incidents:
  - phone field split into country select + national-number textbox; 4 specs broke
  - Next.js basePath '/admin' missing in scanUrl; dual-lane DOM strict-mode failure
  - hardcoded "Demo Salon" tenant name; real seed was "Glamour Nails"
  - Stripe webhook field moved + portal opens in _blank + React 18 batching makes "Opening checkout..." copy unobservable
  - getByRole flakes on slow CI; should default to findByRole
---

## Why this matters

Production code and E2E specs evolve at different rates. Playwright doesn't TS-check
your selectors. A rename in a component file produces zero compile errors in the spec
files that target it. The spec breaks at runtime — usually in CI on someone else's
PR — with a 30-second timeout that masks the actual cause as "flaky test."

Five concrete failure modes seen in production codebases:

1. **Field rename without spec sweep**. PR renames `<input name="phone">` to
   `<select name="phone-country">` + `<input name="phone-national">`. Spec
   `getByLabel(/^phone/i)` ambiguously matches both, throws strict-mode violation.
2. **Dual-lane DOM**. Mobile + desktop both render in DOM, CSS hides one. Spec
   `getByRole('button', { name: 'Save' })` matches both, ambiguous.
3. **Hardcoded seed values**. Spec asserts on tenant name "Demo Salon"; new seed
   uses "Glamour Nails"; spec breaks even though component is unchanged.
4. **Framework batching changes**. React 18 batches state updates; the
   "Opening checkout…" copy that was observable for 200ms in React 17 finishes
   inside one tick now; spec misses it.
5. **`getByRole` vs `findByRole` defaults**. `getByRole` waits 0ms; on a slow CI
   machine the role isn't in DOM yet; test fails with "no matching role found."

## Required reflexes

### Stable hrefs > copy

```typescript
// ❌ Brittle — any copy change breaks the spec
await page.getByRole('link', { name: 'Manage booking' }).click();

// ✅ Stable — href changes only on real route change
await page.locator('a[href^="/admin/bookings/"]').first().click();
```

### Layout-lane test-ids on dual-lane DOM

```tsx
// ✅ Wrap each layout in a stable test-id so specs can scope assertions
<div className="hidden lg:block" data-testid="desktop-lane">…</div>
<div className="lg:hidden" data-testid="mobile-lane">…</div>

// In specs:
await page.getByTestId('desktop-lane').getByRole('button', { name: 'Save' }).click();
```

### Default to `findBy*`

```typescript
// ❌ getByRole returns immediately or throws
await page.getByRole('button', { name: 'Continue' }).click();

// ✅ findByRole waits up to default timeout (5s)
await page.findByRole('button', { name: 'Continue' }).click();
```

(Or use `expect(locator).toBeVisible()` first — also waits.)

### Don't assert transient copy

```typescript
// ❌ React 18 batching can finish before assertion runs
await expect(page.getByText('Opening checkout…')).toBeVisible();

// ✅ Assert the destination state instead
await expect(page).toHaveURL(/\/checkout/);
```

### Treat renames as cross-cut greps

When you rename a label/role/test-id, run the cross-cut grep BEFORE pushing:

```bash
# For label rename
grep -rn "Manage booking" tests/e2e/ apps/admin/messages/ apps/booking/messages/

# For test-id rename
grep -rn 'data-testid="booking-card"' tests/e2e/ apps/

# For field rename
grep -rn "name=\"phone\"" tests/e2e/ apps/
```

Per [api-rename-cross-cut-grep](../../grep-for-siblings/rules/api-rename-cross-cut-grep.md) — extend the 7 grep families to include `tests/e2e/`, `playwright.*.config.ts`, and i18n message files.

## Tests

Add a meta-test that asserts critical hrefs exist (not their copy):

```typescript
it('admin booking detail link is reachable from list', async ({ page }) => {
  await page.goto('/admin/bookings');
  await expect(page.locator('a[href^="/admin/bookings/"]').first()).toBeVisible();
});
```

When the route changes (real change), the test fails loudly. When the copy changes
(cosmetic), the test stays green.

## Anti-patterns

- "I'll update the spec when CI fails" — wastes the next PR's CI cycle, blames the
  wrong author
- "Tests are flaky on CI" — usually means `getBy*` instead of `findBy*`
- "Hardcoded seed name is fine, we never rename tenants" — until you do, in some later PR
- "Dual-lane DOM is just a CSS trick" — Playwright sees both
- "React 18 batching doesn't affect us" — yes it does, on every assertion against
  transient copy
