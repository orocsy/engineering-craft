---
title: Tailwind/CSS Doesn't Error on Unknown Classes — Token Typos Render Zero CSS
type: pitfall
maturity: verified
last-referenced: 2026-05-12
impact: MEDIUM
impact-description: |
  A token-name typo, missing-base-breakpoint, or off-spec native input styling
  generates ZERO CSS but compiles green. Tests pass because they assert state, not
  pixels. Bug is reported by a real user — usually on iOS Safari or a narrow
  viewport — exactly the audience least likely to file good reports.
tags: tailwind, css, design-tokens, mobile, accessibility
applies-to: |
  Any new Tailwind class with a non-standard token name; any breakpoint stack
  (`md:`, `lg:`, `xl:`); any styled native input (color, date, file).
related-rules:
  - aria-lockstep-and-viewport-clamp
historical-incidents:
  - fc5b2ee — border-danger-400, bg-danger-50, text-danger-600 — preset only defined error/error-soft; every error state silently rendered zero CSS
  - 7e557b2 — mobile settings used xl:grid-cols-[…] without grid-cols-1 base; implicit auto column sized to min-content of unbreakable URL; 175px horizontal overflow on mobile portrait
  - 0ca6225 — <input type="color"> with custom 40×40 + custom border-radius silently dropped iOS Safari color-picker tap targets
---

## Why this matters

Three concrete patterns from this codebase, each one a class of bug that won't be
caught by lint, TS, unit tests, or even Playwright assertions on state:

1. **Token typo**. `border-danger-400` looks valid. The Tailwind preset only defines
   `error-*` tokens. Tailwind generates ZERO CSS for `border-danger-400`. The
   element renders with `border: none`. Operators couldn't see invalid-hex swatches
   as red because the red border was never there.

2. **Missing breakpoint base**. `<div className="xl:grid-cols-[200px_1fr]">` has no
   default `grid-cols-*` for screens below `xl`. Implicit behavior: `grid-template-columns: auto`,
   meaning each column sizes to its content's min-width. An unbreakable URL of 175px
   overflows the viewport on mobile portrait. Test passes; designer's mockup shows
   desktop only.

3. **Native input restyling**. `<input type="color">` styled with custom dimensions
   and border-radius works on Chrome desktop, breaks on iOS Safari (the native
   color picker tap target gets dropped). The visual styling looks fine in
   Storybook; the BEHAVIOR (tap → picker opens) doesn't fire.

## Required reflexes

### Typed token map for tokens

```typescript
// ❌ Free-form className — typos generate zero CSS
<div className={`border-${variant}-400`}>...</div>

// ✅ Typed token map — TS errors on unknown variant
const TOKEN_BORDER: Record<Variant, string> = {
  error: 'border-error-400',
  warning: 'border-warning-400',
  info: 'border-info-400',
} as const;
<div className={TOKEN_BORDER[variant]}>...</div>
```

When you add a new `Variant`, TS forces you to add the matching token. When you
remove a token, TS surfaces every consumer.

### Always seed a base for breakpoint stacks

```tsx
// ❌ No base; implicit `auto` columns overflow on small screens
<div className="grid xl:grid-cols-[200px_1fr]">…</div>

// ✅ Explicit base; widening at xl
<div className="grid grid-cols-1 xl:grid-cols-[200px_1fr]">…</div>
```

Same pattern for flex direction, gap, padding — anything that has a "should default
to mobile" answer.

### Hidden-input + styled-overlay for native controls needing custom UI

```tsx
// ❌ Restyled native control; iOS Safari behavior breaks
<input
  type="color"
  className="w-10 h-10 rounded-full border-2"
  value={color}
  onChange={(e) => setColor(e.target.value)}
/>

// ✅ Hidden input + visible label; native tap target preserved
<label className="w-10 h-10 rounded-full border-2 cursor-pointer block"
       style={{ background: color }}>
  <input
    type="color"
    className="sr-only"
    value={color}
    onChange={(e) => setColor(e.target.value)}
  />
</label>
```

The native picker still opens on tap (the `<input>` is the actual focus target);
your custom UI is the visible label.

## Tests

You can't unit-test "did this class render?" but you CAN test:

1. **Token map exhaustiveness**:
```typescript
it('every Variant has a TOKEN_BORDER entry', () => {
  const variants: Variant[] = ['error', 'warning', 'info'];
  variants.forEach((v) => expect(TOKEN_BORDER[v]).toBeDefined());
});
```

2. **Breakpoint base presence** (lint rule):
```javascript
// .eslintrc.js custom rule — every responsive class has a base
'no-orphan-breakpoint': {
  // flag `xl:grid-cols-...` without a sibling `grid-cols-*` (no prefix)
}
```

3. **Visual regression for native controls** — Playwright screenshot diffs on
   real mobile viewports.

## Anti-patterns

- "Tailwind catches typos" — no, it generates zero CSS for unknown classes
- "Designer's mockup is desktop, mobile will work" — prove it; explicit base classes
- "Color picker works in Chrome" — iOS Safari is half your traffic
- "I'll add a screenshot test later" — never happens; add now or accept the bug
- "Storybook shows it correctly" — Storybook viewport ≠ user's iOS portrait

## References

- Tailwind responsive design: https://tailwindcss.com/docs/responsive-design
- iOS Safari `<input type="color">` quirks: https://caniuse.com/input-color
