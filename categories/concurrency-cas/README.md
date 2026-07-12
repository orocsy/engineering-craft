# Concurrency & Compare-And-Swap

**When this category bites**: two requests interleave; one silently overwrites the other.
**Source incidents**: a single password-reset review went through 5 rounds, all in this category.

## The bedrock rule

**Read-Modify-Write across a network call is NEVER atomic.** Between your `get()` and your
`set()`, another caller can have read, mutated, written. If your `set()` doesn't predicate
on the value you read, you will silently overwrite (or be overwritten by) the parallel
caller.

The fix is always one of:
1. **Atomic primitive at the storage layer** — Redis Lua, `SET XX` with value match, DB
   `UPDATE WHERE x = ?` predicate.
2. **Pessimistic lock** — Redis distributed lock (Redlock), `SELECT FOR UPDATE`.
3. **Optimistic version field** — counter you read at start of transaction, then predicate
   the update on it.

JS-level checks (`if (current === expected) await client.del(...)`) are **advisory only**.
They reduce the race window but never close it.

## Rules in this category

| Rule | Impact | Trigger |
|------|--------|---------|
| [state-machine-first](rules/state-machine-first.md) | CRITICAL | Before writing ANY code that mutates shared state |
| [storage-gate-not-js](rules/storage-gate-not-js.md) | CRITICAL | Whenever you write `if (x.consumed) throw; await x.update(consumed=true)` |
| [redis-lua-cas](rules/redis-lua-cas.md) | CRITICAL | Mutating a Redis value conditionally on what you read |
| [postgres-optimistic-cas](rules/postgres-optimistic-cas.md) | CRITICAL | Writing a row that another endpoint also writes |
| [single-use-token-consumption](rules/single-use-token-consumption.md) | CRITICAL | Any `consumedAt`/`usedAt`/`spent` flag |
| [sibling-resource-invariants](rules/sibling-resource-invariants.md) | HIGH | Multiple credentials grant the same action (link + OTP) |
| [race-test-contract](rules/race-test-contract.md) | CRITICAL | Every shared-state mutation needs a `Promise.allSettled` test |
| [cross-tx-cas-recompute-inside-tx](rules/cross-tx-cas-recompute-inside-tx.md) | HIGH | Read → derive → write across tx boundary; recompute INSIDE tx |
| [tx-rollback-contract-layers](rules/tx-rollback-contract-layers.md) | HIGH | Service A calls service B inside tx; B must use `*InTx(tx, ...)` variant |
| [status-set-creep-on-state-machine-evolution](rules/status-set-creep-on-state-machine-evolution.md) | HIGH | `status !== 'X'` denylists silently include any new enum addition |
| [mint-once-vs-mint-on-demand](rules/mint-once-vs-mint-on-demand.md) | MEDIUM | Shareable / printable tokens (QR receipts, magic links) — never re-mint on read |
| [monetary-decimal-symmetry](rules/monetary-decimal-symmetry.md) | MEDIUM | Money fields use `Prisma.Decimal` end-to-end; cross-path selects must align |
| [async-event-revalidates-live-pointer](rules/async-event-revalidates-live-pointer.md) | CRITICAL | Async success event (webhook, job completion) for an entity whose funding/source pointer is mutable |
| [webhook-claim-adopt-completedat](rules/webhook-claim-adopt-completedat.md) | CRITICAL | Designing dedupe for any at-least-once event feed with post-commit effects |

## Templates

- [race-test.template.ts](../../templates/race-test.template.ts)
- [lua-cas-and-delete.template.ts](../../templates/lua-cas-and-delete.template.ts)
- [lua-cas-and-increment.template.ts](../../templates/lua-cas-and-increment.template.ts)
- [postgres-optimistic-cas.template.ts](../../templates/postgres-optimistic-cas.template.ts)

## Anti-patterns

- "I'll just check the value in JS before writing" → race window unchanged
- "I'll add SET XX to be safe" → only protects existence, not value
- "I'll add a per-token gate" → doesn't help when N tokens lead to ONE write
- "I'll use a transaction" → isolation alone doesn't add a CAS predicate
- "It's behind a rate limit so the race is impossible" → rate limits gate request rate, not parallel concurrency

## Historical incidents

| Review round | One-line | Rule that would have prevented it |
|--------------|----------|----------------------------------|
| Round 1 | Link reset TOCTOU — read `consumedAt` then update, two requests both pass check | storage-gate-not-js |
| Round 2 | OTP wrong-attempt SET XX overwrote freshly issued state | redis-lua-cas |
| Round 3 | OTP consume race deleted freshly issued key | redis-lua-cas |
| Round 4 | Cross-method password write race — link CAS + OTP CAS both → applyPasswordReset | postgres-optimistic-cas, sibling-resource-invariants |
| Round 5 | Stale-state OTP consume — wrongAttempt counter swallowed by SET race | redis-lua-cas |
