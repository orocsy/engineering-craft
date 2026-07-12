---
title: Payment-domain lessons route to the payment-engineering skill — and payment-SDK file edits load it first
type: process
maturity: draft
impact: MEDIUM
impact-description: |
  Two-layer knowledge architecture: engineering-craft holds vendor-agnostic
  reflexes; the (private, separate) payment-engineering skill holds
  vendor-specific depth. Without an explicit routing rule the unattended
  consolidation flow defaults everything to craft — the payment skill
  starves and craft accretes vendor detail it must not hold (craft is
  public-mirrored and must stand alone).
tags: knowledge-management, routing, payments, skills
applies-to: |
  (a) /dev-pipeline:consolidate-lessons classification passes;
  (b) ANY session about to edit a file that imports a payment SDK.
related-rules:
  - skill-as-knowledge-base
historical-incidents:
  - "architecture decision (advisory-reviewed): payment depth was deliberately split out of the public craft repo because scars embed business specifics; the routing rule was identified as the single coordination point that keeps the two layers from drifting into duplication"
last-referenced: 2026-07-12
---

## The boundary test (decidable by grep, not judgment)

> **"Can this rule's trigger fire in a codebase with NO payment vendor
> installed?"** YES → engineering-craft. NO → payment-engineering skill
> (`~/.claude/skills/payment-engineering`, private repo).

## The reference direction (one-way)

The payment skill MAY cite craft rules. Craft must NEVER reference the
payment skill in rule content — craft is public-mirrored and must stand
alone. (This rule is the sanctioned exception: a routing pointer, not a
content dependency.)

## The tripwire

Before editing any file that imports a payment SDK (`stripe`, `airwallex`,
`adyen`, `braintree`, `@stripe/*`), load the matching
`payment-engineering/vendors/<vendor>/` pages FIRST. Payment work usually
arrives disguised — "fix the booking bug", "customers double-charged" —
and the disguise defeats description-triggering.

## Anti-patterns

- Restating a craft rule inside the payment skill (or vice versa) — run
  the boundary test; one fact, one home; cross-link, don't copy.
- Classifying a lesson by which FILE it was learned in rather than by
  where its trigger can fire.
