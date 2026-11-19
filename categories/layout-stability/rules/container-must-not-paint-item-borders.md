---
title: A Container Must Not Paint Its Items Borders
type: pitfall
maturity: proven
last-referenced: 2026-08-20
impact: MEDIUM
impact-description: |
  A grid faked hairline separators with gap-px over its own background colour, so empty
  tracks in a partly filled row rendered as large grey placeholder blocks next to real cards.
historical-incidents:
  - grid used gap-px over bg-slate-200; two empty tracks rendered as large grey blocks
  - free-flowing card content misaligned media/price/action across a row
tags: grid, css, visual-defect, cards, alignment
---

# A container must not paint its items' borders

**Impact**: MEDIUM — visible grey placeholder blocks in production; cards that look broken.

**Trigger**: any grid/list using `gap-px` (or 1px gaps) over a coloured container to fake
hairline separators.

## What happened

A product grid drew separators by painting itself and letting the background show through
1px gaps:

```tsx
<div className="grid grid-cols-1 gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
```

With four tracks and two products, the two **empty tracks rendered as large solid grey
blocks** beside the real cards. The cards had no frame of their own, so they were only
visible as "not-grey" regions.

Measured: `gridBg: oklch(0.929 0.013 255.508)`, `gap: 1px`, 4 tracks, 2 cards.

## The rule

**Items own their borders. Containers use real gaps and paint nothing.** Empty tracks are
legitimate — a partly filled last row is the normal case — and they must be invisible.

```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
  {/* card owns its frame */}
  <button className="flex h-full flex-col border border-slate-200 bg-white p-4 …">
```

## Companion rule: cards align by structure

The same grid had a second defect: card content flowed freely, so one long product name
pushed media, price, and action out of alignment across the row.

Make the card a **full-height flex column with fixed regions**:

1. fixed-ratio media (`aspect-square shrink-0`)
2. a **reserved** identifier line (`min-h-4`) so titles start at the same y even when a
   product has no SKU
3. a clamped title (`line-clamp-2`) so height cannot vary with copy
4. the meta row and action pinned with `mt-auto`

## Verification

Measure, don't eyeball — with a deliberately uneven row (one long title, one short):

| Metric | Before | After |
|---|---|---|
| grid background | `slate-200` | transparent |
| card heights | ragged | 479 / 479 |
| media size | inconsistent | 259×259 both |
| title top | misaligned | 198 / 198 |
| action bottom | floated with copy | 348 / 348 |
