---
title: First Paint Must Equal the Settled Layout
type: pitfall
maturity: proven
last-referenced: 2026-08-20
impact: HIGH
impact-description: |
  A client:only island contributed 0px until hydration and a JS-measured lane swapped the
  whole nav in. The nav slid 80px left mid-interaction, so a click aimed at a dropdown arrow
  opened the neighbouring page.
historical-incidents:
  - client:only AccountMenu 0px -> 161px on hydration; nav slid 80px left and stole a click
  - desktop nav gated behind JS width measurement; every cold load swapped the whole navigation in
tags: cls, layout-shift, hydration, islands, astro, responsive
---

# First paint must equal the settled layout

**Impact**: HIGH — mis-clicks. The user commits to a target and the page hands them a
different one.

**Trigger**: any `client:only`/lazy island inside a shared shell (header, toolbar, nav); any
responsive lane chosen by measuring widths in JS after load.

## What happened

A site header had two independent defects that compounded:

1. **An unreserved async island.** `AccountMenu` was `client:only="react"`, so it rendered
   **nothing** on the server. The header row was `justify-between` with three children
   (brand · nav · account). When React mounted, the account cluster went **0px → 161px**,
   the row rebalanced, and the centre nav slid **80px left**.
2. **A JS-gated lane.** The desktop nav was `position: fixed; visibility: hidden` until an
   inline script measured widths and set `data-header-mode="desktop"`. Every cold load
   painted the mobile hamburger first, then swapped the entire navigation in.

Measured consequence:

| | "Electronics & Toys" (arrow at right edge) | "Success Stories" |
|---|---|---|
| Before hydration | 1051 → **1239** | 1243 → 1391 |
| After hydration | 971 → **1158** | **1162 → 1311** |

A click aimed at the chevron (x≈1225) landed inside **Success Stories** (1162–1311).

## The rule

1. **Reserve the box.** An async component gets a container sized to its result:
   `min-width` / `min-height` / `aspect-ratio`. Reserving slightly more than the content
   keeps the used width constant before and after hydration.
2. **Choose responsive lanes in CSS**, at the same threshold the script would use, so the
   common case needs no JS at all.
3. **JS may only downgrade.** Measurement can force the narrower lane when content genuinely
   does not fit; it must never be what makes content appear.

## Fix shape

```css
.header-desktop-account { min-width: 10.5rem; } /* reserve the island's footprint */

@media (min-width: 1360px) {                     /* lane decided before any JS runs */
  [data-site-header]:not([data-header-mode='mobile']) .header-desktop-nav,
  [data-site-header]:not([data-header-mode='mobile']) .header-desktop-account {
    position: static; visibility: visible; pointer-events: auto;
  }
  [data-site-header]:not([data-header-mode='mobile']) .header-mobile-disclosure {
    display: none;
  }
}
```

## Framework notes

- **Astro `client:only`** emits zero server HTML — it opts OUT of the prerender guarantee,
  so it must pay for itself with reserved space. Prefer `client:load` with an SSR-able
  component when the markup can be server-rendered.
- **`client:visible`** defers until intersection; above-the-fold content must not use it.
- Prerendered/static output means first paint is fully under your control: any shift is
  caused by client islands, not by streaming.

## Verification

```js
measure();                    // settled state
acct.innerHTML = '';          // simulate pre-hydration (client:only renders nothing)
measure();                    // pre-hydration geometry
acct.innerHTML = saved;
measure();                    // must equal the settled state
```

Pass condition: the nav's x is **identical** across all three (796 / 796 after the fix; it
was 880 → 799 before).
