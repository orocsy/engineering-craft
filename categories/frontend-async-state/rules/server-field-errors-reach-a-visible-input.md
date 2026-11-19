---
title: A Server Field Error Must Land on a Visible Input, Even One the Client Decided to Hide
last-referenced: 2026-11-12
maturity: draft
type: pattern
impact: MEDIUM
impact-description: |
  A provider console form showed an "hours a family has to pay" input only when the
  page's copy of the program had a price. After the owner set a price in the same page,
  that copy was stale; the server answered 400 with the payment window required, and the
  form said "Check the highlighted fields" while the field wasn't rendered at all. The
  owner had no way to fix it short of a reload. A first error parser also read
  `fieldErrors` from the wrong place in the error body.
tags: forms, validation, fieldErrors, server-authority, stale-state, ux
applies-to: |
  Any form that shows or hides inputs from client-side state (plan, price, role, feature
  flag) and submits to a server that validates which fields are required.
related-rules:
  - parse-dont-cast-at-trust-boundaries (verification-integrity)
  - orphan-promise-and-stale-closure
historical-incidents:
  - a real incident (November 2026): a server-required field stayed hidden after an in-page edit changed the rule that showed it
---

## The lesson

The server is the authority on which fields are required. When the client derives which inputs
to show, a field error for a hidden input must reveal it, and any derived state must be
refreshed after a save on the same page. Read the error schema before writing the parser
(field errors often sit under a `details` object), and test the parser against a real fixture.

## The fix

```tsx
// ❌ Wrong: visibility comes only from (possibly stale) client state
const showPayment = program.priceCents > 0;

// ✅ Right: the server's field errors can also turn an input on
const showPayment = program.priceCents > 0 || "paymentWindowHours" in serverFieldErrors;
```

Also refresh the program (and anything derived from it) in the save handler, so the next
submission starts from what the server now holds.
