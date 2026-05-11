---
title: Draw the State Machine BEFORE Writing Code
impact: CRITICAL
impact-description: |
  Skipping this step was the single root cause of all 5 PR#85 review rounds. Forty
  minutes drawing the state machine would have eliminated 9 of 11 production findings.
tags: concurrency, design-phase, state-machine, race-condition, otp, token
applies-to: |
  Any feature with shared mutable state — Redis keys (especially TTL'd), single-use
  tokens, session rows, anything multiple endpoints can write to.
related-rules:
  - storage-gate-not-js
  - race-test-contract
historical-incidents:
  - PR#85 (all 5 rounds)
---

## Why this matters

Bugs in shared-mutable-state code don't surface in sequential unit tests — they surface
when two requests interleave. You cannot enumerate the interleavings while reading code;
you have to enumerate them on a state diagram first, *then* implement.

In PR#85, every concurrency bug traced to a transition pair I never enumerated:
- `consumeOk × consumeOk` — should mutually exclude (didn't)
- `consumeMiss × consumeMiss` — counter should increment exactly twice (didn't)
- `consumeOk × requestOtp` — consume must NOT delete the freshly issued key (did)
- `consumeMiss × requestOtp` — wrong-attempt must NOT overwrite fresh state (did)

I "knew" these races could exist. I never wrote them down. Codex did, in five rounds.

## The discipline

Before writing code that mutates shared state, the implementation document MUST contain:

### 1. The state set

List every state the resource can be in. Use SCREAMING_SNAKE_CASE. Include terminal
states (CONSUMED, EXPIRED, EVICTED) that look identical from the outside but mean
different things internally.

### 2. The transition table

For each transition, name the trigger, the precondition, and the post-state.

### 3. The concurrent transition matrix

For every PAIR of transitions, decide:
- Can both succeed?
- If yes, what does the resulting state mean? Is it a valid state?
- If they should be mutually exclusive, what's the gate? Where is it enforced?

This is the part everyone skips and pays for.

## Worked example: OTP password-reset key in Redis

```
Resource: pwreset:otp:<tenantId>:<userId>  (Redis JSON-encoded value)

States:
  NEVER_ISSUED  -- key does not exist
  ISSUED        -- key exists with {codeHash, attempts, issuedAt}
  CONSUMED      -- key was successfully consumed (deleted)
  EVICTED       -- key was deleted because attempts >= MAX_ATTEMPTS
  EXPIRED       -- TTL elapsed (Redis deleted it)

Transitions:
  Trigger        Precondition          Action                 Post
  ─────────────────────────────────────────────────────────────────
  requestOtp     ANY                   SET key {hash, 0, ts} ISSUED
  consumeOk      ISSUED ∧ hashMatch    DEL key               CONSUMED
  consumeMiss    ISSUED ∧ !hashMatch   incr attempts         ISSUED|EVICTED
  capHit         attempts >= MAX       DEL key               EVICTED
  ttl            time > issuedAt+15m   (Redis evicts)        EXPIRED

Concurrent transition pairs (THE PART I SKIPPED ON PR#85):

  consumeOk × consumeOk
    → BOTH pass hashMatch in JS, both DEL. Two password writes via applyPasswordReset.
    → Gate: Lua compare-and-delete (KEYS[1] DEL only if codeHash match).

  consumeMiss × consumeMiss
    → BOTH read attempts=0 in JS, both write attempts=1. Counter widens budget silently.
    → Gate: Lua compare-and-increment (read+inc inside Lua).

  consumeOk × requestOtp
    → consumeOk reads codeHash=H_old. requestOtp overwrites with codeHash=H_new.
       consumeOk's DEL deletes the FRESH key. STALE H_old won.
    → Gate: Lua compare-and-delete predicates DEL on H_old; mismatch → 0, no delete.

  consumeMiss × requestOtp
    → consumeMiss's SET XX writes back stale state (codeHash=H_old, attempts=1) over
       the fresh state (codeHash=H_new, attempts=0).
    → Gate: Lua compare-and-increment predicates increment on H_old; mismatch → 0.

  consumeOk × ttl  (race against natural expiry)
    → consumeOk hits Lua AFTER Redis evicted. Lua sees no key, returns -1.
    → Gate: caller treats -1 as "OTP expired", returns 410 GONE.

  capHit × consumeOk  (rare, only if MAX_ATTEMPTS within milliseconds)
    → consumeMiss(N+1) trips cap, deletes key. consumeOk arrives, no key, -1.
    → Gate: Lua atomically tests cap and deletes; consumeOk sees -1 cleanly.
```

## What this would have looked like in the original PR#85 design doc

Section 4 of the design document should have been a markdown table laid out like the
"Concurrent transition pairs" block above. Every row is a test case to write. Every
"Gate:" line is a constraint to enforce in code.

When the implementation diverges from the gate column, that's a review finding
**before the first commit**, not a Codex finding after merge.

## Templates

- [Race test template](../../../templates/race-test.template.ts) — implement one test per
  row of the concurrent transition matrix.

## Tooling support

The Excalidraw skill (`dev-pipeline:excalidraw-diagram-generator`) can render a state
machine from a description. For OTP-style flows, generate the diagram and check it in
under `docs/<feature>/state-machine.excalidraw` so the review phase has it.

## When this rule does NOT apply

- Pure read paths (no mutation).
- Resource owned by exactly one entry point AND no in-flight retry.
- One-shot scripts where concurrency genuinely cannot happen (e.g., a one-time data
  migration run as a single process).

When in doubt, draw it.
