---
title: If you choose not to consume a vendor's terminal event, YOU own finalizing that state locally
type: guideline
maturity: verified
impact: HIGH
impact-description: |
  Vendors emit terminal events (canceled, expired, deauthorized) that many
  integrations deliberately don't subscribe to. Every local action that
  puts a vendor object into such a state must then finalize the local row
  itself — otherwise the row waits forever for an event that will never be
  processed, and downstream logic keyed on "pending" states silently
  misroutes.
tags: webhooks, integrations, terminal-state, silent-failure
applies-to: |
  Any integration that (a) handles a SUBSET of the vendor's event types and
  (b) has local code paths that push vendor objects into states whose
  events are in the unhandled set (cancel, expire, void, disconnect).
related-rules:
  - configured-state-visible
historical-incidents:
  - "a real incident: a sweep canceled abandoned vendor payment objects but the canceled-event type was unhandled — the local payment rows stayed PENDING forever; the follow-the-money review found the state machine could never terminate on that path"
last-referenced: 2026-07-12
---

## Why this matters

Handling a subset of event types is correct engineering — most types are
noise for your domain. But the unhandled set becomes an implicit contract:
**no local state may DEPEND on an event you don't consume.** The trap fires
exactly when local code triggers the vendor transition (your own cancel/
expire call) and then waits for the vendor to tell it what it already knows.

## Incorrect

```ts
// ❌ Cancels the vendor object; local row finalization left to a
// `*.canceled` webhook that is not in the handled set
await gateway.cancelIntent(intent.id);
// Payment row stays PENDING forever
```

## Correct

```ts
// ✅ The canceling side owns local finalization — CAS-guarded so a racing
// success webhook (if it won) is respected
await gateway.cancelIntent(intent.id); // best-effort; uncancelable states tolerated
await db.payment.updateMany({
  where: { id: payment.id, status: "PENDING" },
  data: { status: "FAILED" },
});
```

## The audit

For each vendor state your code can cause, ask: which event finalizes the
local row, and do we handle it? If not handled → the causing code path
must CAS-finalize locally, and a backstop must exist for the event
arriving anyway (see async-event-revalidates-live-pointer).

## Anti-patterns

- Subscribing to the extra event type "just in case" without a consumer
  design — now the dedupe table accumulates rows that mean nothing.
- Finalizing WITHOUT a status guard — clobbers the success case when the
  vendor event won the race.
