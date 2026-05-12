---
title: ARIA-Describedby Must Lockstep with Tooltip Mount/Unmount; Clamp Both Edges
type: guideline
maturity: verified
last-referenced: 2026-05-12
impact: MEDIUM
impact-description: |
  Tooltip dismisses on Escape but `aria-describedby` still references the unmounted
  tooltip element; tooltip slides off the right edge of a narrow viewport. Bug is
  invisible to keyboard users who can't easily report it. Pure unit tests pass; integration
  tests pass on big viewports.
tags: accessibility, aria, tooltip, popover, viewport, mobile
applies-to: |
  Any tooltip, popover, modal, or dropdown with `aria-describedby` / `aria-controls`.
  Any component positioned with `left/right` math.
related-rules:
  - silent-css-class-vacuum
historical-incidents:
  - 6cee019 — chip's aria-describedby="calendar-booking-tooltip" referenced an element no longer in DOM after Escape/scroll dismissed parent's tooltip
  - 7894e8a — tooltip dismiss on scroll/resize, focus + blur ARIA toggle, undefined-handler safety
  - 130ee6b — bottom-placement tooltip left clamped at viewport-left only; tooltip slid off-screen on narrow viewports
---

## Why this matters

Tooltip components track `isOpen` state internally (mouseenter/mouseleave/focus/blur).
The parent tracks visibility independently (a chip might dismiss the tooltip on
scroll/resize/Escape). When these two states drift, screen readers point users at
DOM elements that no longer exist.

Three concrete failure modes from this codebase:

1. **`aria-describedby` survives unmount.** Chip renders
   `<button aria-describedby="calendar-booking-tooltip">`. Tooltip element with
   that ID unmounts on Escape. Screen reader still announces "described by
   calendar-booking-tooltip" but the element is gone — silence or "no description
   found" depending on the AT.

2. **Window vs documentElement width.** `window.innerWidth` excludes the vertical
   scrollbar gutter on Windows/Firefox. `documentElement.clientWidth` includes it.
   Position math using `window.innerWidth` underestimates available space; tooltip
   clips on the right edge.

3. **One-edge clamp.** Code clamps tooltip `left >= 0` (don't slide off left edge)
   but never clamps `right <= viewport`. On narrow viewports with tooltips
   anchored to right-side elements, the tooltip slides off the right.

## Incorrect

```tsx
// ❌ Child tracks isOpen independently; parent's dismiss doesn't propagate
function Chip({ booking }) {
  return (
    <Tooltip id="calendar-booking-tooltip" content={...}>
      <button aria-describedby="calendar-booking-tooltip">{booking.name}</button>
    </Tooltip>
  );
}

function Tooltip({ id, content, children }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      {React.cloneElement(children, {
        onMouseEnter: () => setIsOpen(true),
        onMouseLeave: () => setIsOpen(false),
      })}
      {isOpen && <div id={id} role="tooltip">{content}</div>}
    </>
  );
}
// ↑ When parent calls dismissTooltip() on scroll/resize, child's isOpen stays true
//   until next mouseleave. ARIA-describedby on the button still points at the
//   tooltip ID even though the tooltip element won't be rendered.
```

```typescript
// ❌ One-edge clamp + window.innerWidth
function calcTooltipPosition(anchor: DOMRect, tooltipWidth: number) {
  const left = Math.max(0, anchor.left); // clamps left only
  return { left, top: anchor.bottom };
  //                  ^^^^^^^^^^^^^^^ no right-edge clamp; tooltip slides off
}
```

## Correct

```tsx
// ✅ Parent owns visibility; child reflects it; aria toggles in lockstep
function Chip({ booking, isTooltipOpen, onTooltipClose }) {
  const tooltipId = `booking-tooltip-${booking.id}`;
  return (
    <>
      <button aria-describedby={isTooltipOpen ? tooltipId : undefined}>
        {booking.name}
      </button>
      {isTooltipOpen && (
        <div id={tooltipId} role="tooltip" onClick={onTooltipClose}>
          {/* content */}
        </div>
      )}
    </>
  );
}

// Parent dismisses on scroll/resize/escape — chip re-renders, aria-describedby
// becomes undefined in the same render tick as the tooltip unmount.
```

```typescript
// ✅ Two-edge clamp + documentElement.clientWidth
function calcTooltipPosition(anchor: DOMRect, tooltipWidth: number) {
  const viewportWidth = document.documentElement.clientWidth;
  let left = anchor.left;
  // Right-edge clamp
  if (left + tooltipWidth > viewportWidth - 8) {
    left = viewportWidth - tooltipWidth - 8;
  }
  // Left-edge clamp (after right adjust, so right wins on tiny viewports)
  if (left < 8) {
    left = 8;
  }
  return { left, top: anchor.bottom };
}
```

## Tests

```typescript
describe('Chip ARIA lockstep', () => {
  it('removes aria-describedby when tooltip closes', () => {
    const { rerender } = render(<Chip booking={b} isTooltipOpen={true} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', 'booking-tooltip-1');

    rerender(<Chip booking={b} isTooltipOpen={false} />);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-describedby');
  });

  it('tooltip element unmounts when isTooltipOpen flips to false', () => {
    const { rerender } = render(<Chip booking={b} isTooltipOpen={true} />);
    expect(screen.queryByRole('tooltip')).toBeInTheDocument();

    rerender(<Chip booking={b} isTooltipOpen={false} />);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('calcTooltipPosition', () => {
  it('clamps right edge on narrow viewport', () => {
    Object.defineProperty(document.documentElement, 'clientWidth', { value: 320, writable: true });
    const anchor = { left: 280, right: 290, top: 100, bottom: 120 } as DOMRect;
    const pos = calcTooltipPosition(anchor, 200);
    expect(pos.left).toBeLessThanOrEqual(320 - 200 - 8);
  });

  it('clamps left edge', () => {
    Object.defineProperty(document.documentElement, 'clientWidth', { value: 1024, writable: true });
    const anchor = { left: -50, right: 0, top: 100, bottom: 120 } as DOMRect;
    const pos = calcTooltipPosition(anchor, 200);
    expect(pos.left).toBeGreaterThanOrEqual(8);
  });
});
```

## Anti-patterns

- Child component owns `isOpen` independently of parent's mount/unmount → drift
- `aria-describedby` value computed once at render, not in lockstep with mount
- `window.innerWidth` for position math (excludes scrollbar gutter)
- Clamping only the left edge → slides off right
- Unit tests asserting state, not the rendered DOM's `aria-describedby` value
- "I'll add accessibility tests later" — keyboard users find this in production

## References

- [WAI-ARIA Authoring Practices: Tooltip](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)
- [WCAG 2.1 SC 1.4.13 Content on Hover or Focus](https://www.w3.org/WAI/WCAG21/Understanding/content-on-hover-or-focus.html)
