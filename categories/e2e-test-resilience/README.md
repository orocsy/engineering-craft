# E2E Test Resilience

**When this category bites**: an unrelated PR renames a field/copy/role/test-id; 4 E2E specs break at once; the fix is "update selectors" but the same class of bug keeps recurring.

**Source incidents**: 8+ commits over 6 months.

## Bedrock rule

**E2E specs over-couple to the rendered shape (copy, role, test-id) of components they don't own.** Any rename in production code without a parallel grep through `tests/e2e/` and every `playwright.*.config.ts` project will silently break specs in unrelated PRs.

## Rules

| Rule | Impact | Trigger |
|------|--------|---------|
| [selector-coupling-and-blast-radius](rules/selector-coupling-and-blast-radius.md) | HIGH | Any rename of a label/role/test-id; any new dual-lane (responsive desktop/mobile) component |

## Anti-patterns

- `getByText('Demo Salon')` when seed name is configurable
- `name: /^phone/i` when the field will be split into `country select` + `national-number textbox`
- `getByRole('button', { name: 'X' })` defaulting (waits 0ms) when CI is slow → use `findByRole`
- Dual-lane DOM rendering BOTH desktop + mobile (CSS-toggled) without a layout-lane test-id wrapping each → strict-mode ambiguity
- Asserting transient copy ("Opening checkout…") that React 18 batching can finish-and-clear before assertion runs

## Related

- [grep-for-siblings/api-rename-cross-cut-grep](../grep-for-siblings/rules/api-rename-cross-cut-grep.md) — the meta-pattern this extends
