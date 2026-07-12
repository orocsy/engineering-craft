---
title: Webhook dedupe is claim-in-tx + adopt-on-collision + completedAt — not insert-first-no-op, not insert-last
type: model
maturity: proven
impact: CRITICAL
impact-description: |
  Both obvious webhook-dedupe designs are wrong. Dedupe-insert-first with
  unconditional no-op on duplicates makes crash recovery impossible (a
  post-tx effect failure is no-op'd away forever by redelivery).
  Dedupe-insert-last lets business mutations run before the dedupe commits
  and breaks parallel delivery. Money feeds turn either defect into
  double-charges or lost invoices.
tags: webhooks, idempotency, at-least-once, crash-recovery, cas
applies-to: |
  Any at-least-once event feed with redelivery (payment vendors, GitHub,
  messaging queues) whose events drive local state transitions plus
  post-commit effects (emails, documents, downstream calls).
related-rules:
  - tx-rollback-contract-layers
  - async-event-revalidates-live-pointer
historical-incidents:
  - "a real design near-miss caught at review: the insert-first-always-no-op variant would have made a crashed post-tx invoice issuance unrecoverable — the vendor's redelivery (the only retry mechanism) would hit the dedupe row and skip the missing invoice forever"
last-referenced: 2026-07-12
---

## Why this matters

At-least-once feeds give you duplicates, parallel deliveries of the SAME
event, and redelivery-as-retry. The dedupe row has to serve three masters:
exactly-once state transitions, crash recovery of post-commit effects, and
parallel-delivery safety. Only one shape serves all three.

## The model

1. Insert `ProcessedEvent(eventId @unique)` FIRST, **inside the same
   serializable tx as every state transition** the event causes.
2. Run post-commit effects AFTER the tx — each idempotent on its own DB
   uniqueness anchor (invoice number: `@unique` on the causing id; email:
   log-table unique key), NOT on caller bookkeeping.
3. Set `completedAt` LAST, only when effects finished.
4. On unique-collision at step 1: `completedAt` set → true replay → ack
   no-op. `completedAt` NULL → a prior delivery died mid-plan → **ADOPT**:
   re-run the CAS-guarded transitions (they no-op) and the idempotent
   effects, then set `completedAt`.

A throw anywhere leaves `completedAt` null, so the feed's own redelivery
completes the half-done plan. One nullable column buys crash-consistency
for every future consumer of the endpoint.

## Consequences that look like bugs but are load-bearing

- Effects are pushed UNCONDITIONALLY and re-run freely — the anchors count,
  the caller doesn't.
- At-least-once side effects (a rare duplicate email) are the PRICE of
  crash recovery; a CAS-before-send "fix" breaks the adopt path to close a
  narrower window than claimed. Accept and document.
- Unknown/unhandled event types are acked WITHOUT a dedupe row — the table
  means "handled", not "seen".

## Anti-patterns

- Ack-then-process (lose the event on crash).
- Dedupe on an in-memory set or cache (dies with the process).
- Deleting dedupe rows in test-reset endpoints for tables that are
  deliberately tenant-less — the delete is globally scoped.
