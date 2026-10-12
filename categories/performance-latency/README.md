# Performance & Latency

**When this category bites**: an action that does little work takes seconds
per item and gets proportionally slower in batches, and the explanation on
offer blames the framework or SDK without a measurement.

**Source incidents**: channel catalog publishing, 2026-10-08 (15–25 s per
publish → about 4–6 s).

## Bedrock rule

**Measure before explaining: split server time from end-to-end time, rule out
auth, and count the serial round trips. Most "slow backend" actions are a
client-driven chain of requests through a distant gateway; move the chain
server-side into one request with a time budget and an idempotent hand-back,
and run independent items a few at a time.**

## Rules

| Rule | Impact | Trigger |
|------|--------|---------|
| [measure-the-request-chain-before-blaming-the-sdk](rules/measure-the-request-chain-before-blaming-the-sdk.md) | HIGH | Slow multi-step action driven by the browser; slow batch loop; "the SDK can't batch" |

## Anti-patterns

- Accepting "the SDK has no batch API" without timing the function itself
- A browser-driven protocol of 8–9 dependent requests per item
- `for (const id of ids) await update(id)` for independent items
- Unbounded `Promise.all` over a batch with writes that may need a stop rule
