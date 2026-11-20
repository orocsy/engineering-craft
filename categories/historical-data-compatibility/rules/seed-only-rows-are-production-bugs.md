---
title: A Row Only the Seeds Create Is a Production Bug Waiting for Its First Real Signup
type: pitfall
maturity: draft
last-referenced: 2026-11-20
impact: HIGH
impact-description: |
  A downstream flow required a companion row (a per-workspace default policy) that no product
  code path ever created; only the seed script did. Every seeded workspace worked, every test
  passed, and every workspace created through real sign-up refused its first booking.
historical-incidents:
  - "a booking platform: workspaces created through self-service sign-up had no default identity-sharing policy, so a family's first booking failed at the consent step with a 422 the web showed as 'Something went wrong'; seeds and fixtures always created the row; found by a local end-to-end run that started from a fresh sign-up"
tags: seeds, fixtures, onboarding, defaults, migrations, testing
related-rules:
  - fixtures-must-include-the-oldest-shape
  - optional-field-gates-the-record
---

# A row only the seeds create is a production bug waiting for its first real signup

**Impact**: HIGH — the whole suite is green on data the product can never produce.

**Trigger**: a flow that reads a per-tenant/per-account companion row (default policy,
settings, notice, plan, preferences); adding such a read; writing seeds or fixtures that create
"the usual" rows for a new account.

## The rule

1. **Create companion rows with their parent, in the same transaction.** Whatever creates a
   workspace (every entry point: password sign-up, OAuth sign-up, admin creation, import) also
   creates the defaults later flows require. If the parent commits without them, it is born
   broken.
2. **Backfill the parents that already exist** in an idempotent migration (insert where
   missing), shipped with the fix.
3. **Test from the product's own creation path, not from seeds.** One end-to-end test signs up
   a fresh account through the real flow and walks it to the first downstream action that reads
   the companion row (here: a first booking).
4. **Audit the seeds.** For every row type a seed creates for a new account, find the product
   code that creates it in production. A row type with no such code is either unnecessary or
   this bug.

## Why it happens

Seeds are written once to make local development pleasant, so they create everything a
"complete" account has. Product code is written feature by feature, and the feature that later
started reading the row never owned creating it. Tests built on seeds inherit the complete
account, so nothing fails until a real one arrives.

## The check, in review

A diff that adds a read of a per-account row (`findUnique`/`findFirst` that throws or returns a
4xx when absent) must name the code that creates that row for an account created today — not a
seed, not a fixture.

## Sources

- Martin Fowler, "DDD Aggregate": an aggregate's invariants are kept within one transactional
  boundary, so a parent and the parts it cannot exist without are created together:
  https://martinfowler.com/bliki/DDD_Aggregate.html
- Prisma transactions (nested writes create related records atomically):
  https://www.prisma.io/docs/orm/prisma-client/queries/transactions
