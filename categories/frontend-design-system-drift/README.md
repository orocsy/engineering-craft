# Frontend Design System Drift

**When this category bites**: a Tailwind class typo or off-spec native input renders zero CSS / drops behaviors. Tests pass because they assert state, not pixels. A real user reports "the danger badge is white" or "the color picker doesn't open on iOS Safari."

**Source incidents**: 3 commits + ongoing risk.

## Bedrock rule

**Tailwind/CSS does not error on unknown classes.** A token-name typo, missing-base-breakpoint, or off-spec native input styling generates ZERO CSS but compiles green. The bug is invisible to TS, lint, unit tests, AND Playwright assertions on state.

## Rules

| Rule | Impact | Trigger |
|------|--------|---------|
| [silent-css-class-vacuum](rules/silent-css-class-vacuum.md) | MEDIUM | Adding a Tailwind class with a non-standard token name; any breakpoint stack; any styled native input (color picker, date input, file input) |

## Anti-patterns

- `border-danger-400` when the preset only defines `error-*` tokens
- `xl:grid-cols-[…]` without a base `grid-cols-1` → implicit `auto` columns silently overflow on mobile
- Restyling `<input type="color">` with custom border-radius / size — silently drops iOS Safari color-picker tap targets
- "Visual styling looked fine in dev, behavior didn't fire in prod" — that's the silent-vacuum tell

## Related

- [grep-for-siblings/security-literal-grep](../grep-for-siblings/rules/security-literal-grep.md) — token typos are sibling-grep targets too
