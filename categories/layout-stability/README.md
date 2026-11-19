# Layout Stability

**When this category bites**: a user clicks a menu and the page opens the item next to the
one they aimed at; a grid shows grey placeholder blocks where nothing should be; cards in a
row have their price and button at different heights; a CLS score of 0 while users report
the page "jumping".

**Source incidents**: 1 feature, 4 commits.

## Bedrock rule

**The server-rendered first paint must already equal the settled layout. Anything arriving
later gets a reserved hole to land in — never room made for it on arrival. Responsive lanes
are chosen in CSS; JS may only downgrade, never pop content in.**

## Rules

| Rule | Impact | Trigger |
|------|--------|---------|
| [first-paint-must-equal-settled-layout](rules/first-paint-must-equal-settled-layout.md) | HIGH | Any `client:only`/lazy island in a shared shell; any responsive lane chosen by measuring widths in JS |
| [css-and-js-must-share-the-media-query](rules/css-and-js-must-share-the-media-query.md) | HIGH | Any breakpoint enforced in BOTH a stylesheet and a script |
| [container-must-not-paint-item-borders](rules/container-must-not-paint-item-borders.md) | MEDIUM | Any grid/list using `gap-px` over a coloured container to fake separators |

## Anti-patterns

- `client:only` island in a flex row with no reserved `min-width` — nav slides when it mounts
- Lane selection via `window.innerWidth` in an inline script while CSS uses `@media`
- `gap-px` over `bg-*` on a grid container — partly filled rows render as grey blocks
- Card content flowing freely in a grid — one long title misaligns the whole row
- Reconciling responsive state only inside a `next !== previous` transition branch
- Trusting CLS = 0 over a user's report of movement

## Measurement discipline

CLS is a proxy, not the truth. It only scores elements that were **already painted**, so a
lane swap (hidden → visible) and a removal can be visually violent and score ~0. Warm
localhost settles inside one frame; a background tab freezes `requestAnimationFrame`
entirely, so a measurement script may never run.

When a user reports movement, force the two layout states in one page and diff
`getBoundingClientRect()`. Then state plainly whether a number came from a live capture or
a forced state comparison.
