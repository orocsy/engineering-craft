# Accessibility State Sync

**When this category bites**: tooltip dismisses on Escape but `aria-describedby` still references the unmounted tooltip element; tooltip slides off the right edge of a narrow viewport; keyboard users land on dangling references.

**Source incidents**: 6cee019, 7894e8a, 130ee6b (3 commits).

## Bedrock rule

**Child components track local hover/focus state independently from parent visibility state. The two states drift, leaving ARIA describes pointing at unmounted elements or visual elements off-screen.**

Pure unit tests pass (state asserted in isolation); integration tests pass on big viewports. The bug is only visible to keyboard-and-screenreader users on narrow screens — exactly the audience least likely to file bug reports.

## Rules

| Rule | Impact | Trigger |
|------|--------|---------|
| [aria-lockstep-and-viewport-clamp](rules/aria-lockstep-and-viewport-clamp.md) | MEDIUM | Any tooltip, popover, modal, or dropdown with `aria-describedby` / `aria-controls`; any component positioned with `left/right` math |

## Anti-patterns

- Child component owns `isOpen` state independently of parent's mount/unmount → drift
- `aria-describedby` value computed once at render, not in lockstep with tooltip mount/unmount
- Tooltip position uses `window.innerWidth` (excludes vertical scrollbar gutter) instead of `documentElement.clientWidth`
- Clamping only the LEFT edge of a tooltip → slides off the right on narrow viewports
- Unit tests assert state, not the rendered DOM's `aria-describedby` value

## Related

- [frontend-design-system-drift/silent-css-class-vacuum](../frontend-design-system-drift/rules/silent-css-class-vacuum.md) — both are "tests pass / users see broken UI"
