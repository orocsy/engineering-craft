---
title: CSS and JS Must Evaluate the Same Media Query
type: pitfall
maturity: proven
last-referenced: 2026-08-20
impact: HIGH
impact-description: |
  A stylesheet used @media (min-width: 1360px) while the script used window.innerWidth.
  Media queries include the scrollbar, innerWidth excludes it, so at the boundary CSS showed
  the desktop lane and JS forced it back to mobile — passing locally, failing on the runner.
historical-incidents:
  - @media(min-width:1360px) vs window.innerWidth disagreed by scrollbar width at the boundary
  - mobile disclosure left open behind a hidden lane; passed locally, failed only on the deployed runner
  - transition-only reconciliation missed coalesced resizes
tags: breakpoints, media-query, responsive, scrollbar, boundary
---

# CSS and JS must evaluate the same media query

**Impact**: HIGH — the two disagree at the boundary and fight each other, leaving invisible
open menus and stranded focus.

**Trigger**: any breakpoint enforced in BOTH a stylesheet and a script.

## What happened

After moving responsive lane selection into CSS:

```css
@media (min-width: 1360px) { /* show desktop lane */ }
```

the script that could still force the mobile lane kept its original check:

```js
if (window.innerWidth < 1360) return false;
```

These are **not the same question**:

| API | Measures |
|---|---|
| `@media (min-width: …)` | viewport width **including** the classic scrollbar |
| `window.innerWidth` | viewport width **excluding** the scrollbar |

At the boundary they disagreed by the scrollbar width (~15px). CSS laid out the desktop
lane; the script concluded "mobile" and forced `data-header-mode="mobile"`, which hid the
desktop lane and left the mobile disclosure open behind it. Focus restoration then targeted
an element in a hidden lane.

It passed locally (no scrollbar in the harness) and failed only on the deployed runner —
the worst possible signature.

## The rule

When CSS and JS must agree on a breakpoint, **JS asks the CSS question**:

```js
if (!window.matchMedia('(min-width: 1360px)').matches) return false;
```

One threshold, one source of truth, one string. If the query string is used in more than one
place, hoist it to a constant shared by both, or read it from a custom property.

## Related trap in tests

A browser test that resizes to **exactly** the threshold inherits the same ambiguity. Cross
thresholds **with margin** in browser tests (1440 for a 1360 breakpoint); reserve exact
boundary values for unit tests where the input is not subject to scrollbars.

## Companion rule: reconcile idempotently

The same incident produced a second defect. The header closed its mobile disclosure only
inside the transition branch:

```js
if (nextMode === previousMode) return;      // ← coalesced resize ⇒ never closed
if (nextMode === 'desktop') { mobileDisclosure.open = false; }
```

Any coalesced or missed resize run left an open menu behind a hidden lane. Reconcilers that
run on every frame/resize should assert the **invariant**, not react to edges:

```js
const nextMode = desktopFits() ? 'desktop' : 'mobile';
// idempotent: true on every run, not only on transitions
if (nextMode === 'desktop' && mobileDisclosure.open) mobileDisclosure.open = false;
if (nextMode === previousMode) return;
```
