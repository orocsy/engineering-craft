---
title: Every Shared-State Mutation Needs a `Promise.allSettled` Race Test
impact: CRITICAL
impact-description: |
  Race conditions don't show up in sequential unit tests. The contract is
  `expect(fulfilled).toHaveLength(1)` — exactly one fulfilled, not "at least one" and
  not "errors thrown." Missing this test is the structural reason PR#85 needed 5 review
  rounds.
tags: testing, concurrency, race-condition, promise-allsettled
applies-to: |
  Every endpoint or service method that mutates shared state. Treat as a HARD
  prerequisite for marking a feature ready for review.
related-rules:
  - state-machine-first
  - storage-gate-not-js
references-existing-skill: |
  This rule extends `nodejs-testing/rules/test-concurrent-operations.md` (which exists
  but ranks MEDIUM impact and only triggers on "writing tests"). Production-defensive
  ranks it CRITICAL and triggers on the FEATURE category, not the test phase.
historical-incidents:
  - PR#85 (all 5 rounds — none of them had a race test until round 4)
---

## Why this matters

A race test with `Promise.allSettled` is the simplest, most reliable way to expose a
TOCTOU bug. Sequential tests verify the contract holds when only one caller exists.
Race tests verify it holds when N callers contend.

The existing `nodejs-testing/rules/test-concurrent-operations.md` has the right pattern
but is labeled MEDIUM impact and triggers on "writing tests." That ordering meant the
rule fired AFTER the implementation was done, when the implementer had already declared
"tests pass" sequentially. Production-defensive flips the order:

> Race test contract is a CRITICAL gate. The implementation is not done until every
> shared-state mutation has a race test that asserts `expect(fulfilled).toHaveLength(1)`.

## The contract assertion

```typescript
const results = await Promise.allSettled([fnA(), fnB()]);
const fulfilled = results.filter(r => r.status === 'fulfilled');
const rejected  = results.filter(r => r.status === 'rejected');

expect(fulfilled).toHaveLength(1);   // EXACTLY one wins
expect(rejected).toHaveLength(1);    // EXACTLY one loses
expect((rejected[0] as PromiseRejectedResult).reason)
  .toBeInstanceOf(ExpectedConflictException);
```

What's wrong with the alternatives:

| Weaker assertion | Why it fails |
|------------------|-------------|
| `expect(fulfilled.length).toBeGreaterThan(0)` | Allows BOTH fulfilled — silent double-write |
| `expect(rejected.length).toBe(1)` (alone) | Allows BOTH rejected — bug stops user entirely |
| `await expect(...).rejects.toThrow(); await expect(...).rejects.toThrow();` (sequential) | Sequential tests can NEVER reveal a race |
| `expect(fulfilled.length + rejected.length).toBe(2)` | Always true (Promise.allSettled always settles N) — tests nothing |

The contract is **exactly-one-fulfilled** because that's what the user sees: one of two
concurrent attempts produces an action; the other gets a clean error. Anything else is
a bug.

## Three flavors of race test

### Flavor 1: real concurrency against a real DB

The strongest signal — uses real Postgres + real Redis to exercise the actual locking.
Slower but catches real interleavings.

```typescript
it('two concurrent /reset-password requests on the same jti', async () => {
  const jti = await issueAndPersistToken(userId);
  const [a, b] = await Promise.allSettled([
    request(app).post('/auth/reset-password').send({ token: signJwt(jti), newPassword: 'A!' + rand() }),
    request(app).post('/auth/reset-password').send({ token: signJwt(jti), newPassword: 'B!' + rand() }),
  ]);
  const ok = [a, b].filter(r => r.status === 'fulfilled' && (r.value as Response).status === 204);
  const conflict = [a, b].filter(r =>
    r.status === 'fulfilled' && [410, 409].includes((r.value as Response).status)
  );
  expect(ok).toHaveLength(1);
  expect(conflict).toHaveLength(1);
});
```

### Flavor 2: simulated concurrency via mock interleaving

For unit tests, simulate the race by controlling when each await resolves.

```typescript
it('OTP wrong-attempt does not clobber a freshly issued state', async () => {
  // Setup state machines
  const states: Array<{ codeHash: string; attempts: number }> = [];
  mockRedis.eval.mockImplementation(async (script, _numkeys, _key, expectedHash, ...rest) => {
    const current = states[states.length - 1];
    if (!current) return -1;
    if (current.codeHash !== expectedHash) return 0;  // <- the CAS check
    current.attempts++;
    return 1;
  });

  // T0: issue OTP "AAA"
  states.push({ codeHash: 'H_old', attempts: 0 });

  // T1: fresh issuance overwrites
  states.push({ codeHash: 'H_new', attempts: 0 });

  // T2: stale wrong-attempt arrives with H_old as the expected hash
  const result = await service.resetPasswordOtp({ email, code: 'AAA', newPassword: '...' });
  // Expectation: GoneException because Lua returned 0 (mismatch)
  // The fresh state must be intact
  expect(states[states.length - 1].attempts).toBe(0);
  expect(states[states.length - 1].codeHash).toBe('H_new');
});
```

### Flavor 3: per-call mock to simulate the race-loser explicitly

When real concurrency is too flaky in CI, simulate by having the storage primitive
return the loser response on the second call.

```typescript
it('loser sees Conflict when concurrent password reset wins the CAS', async () => {
  // First updateMany call (winner) returns count=1
  // Second updateMany call (loser) returns count=0
  mockPrisma.user.updateMany
    .mockResolvedValueOnce({ count: 1 })
    .mockResolvedValueOnce({ count: 0 });

  const [a, b] = await Promise.allSettled([
    service.applyPasswordReset(userId, 'A'),
    service.applyPasswordReset(userId, 'B'),
  ]);

  const ok = [a, b].filter(r => r.status === 'fulfilled');
  const conflict = [a, b].filter(r =>
    r.status === 'rejected' &&
    (r as PromiseRejectedResult).reason instanceof ConflictException
  );
  expect(ok).toHaveLength(1);
  expect(conflict).toHaveLength(1);
});
```

## When to use which flavor

- Implementation phase: flavor 2 or 3 (fast, deterministic, runs in unit suite).
- Validation phase: flavor 1 (slow, runs in integration suite, catches real interleavings).
- Both: ideally. Flavor 2/3 confirms the contract; flavor 1 confirms the storage
  primitive actually enforces it.

## What to test for

For every state machine transition pair from
[state-machine-first.md](state-machine-first.md), there should be at least one race
test. The transition matrix in your design doc IS the test plan.

## Anti-patterns

- "I'll add the race test if Codex flags one" → backwards. Codex flags it because it
  wasn't there.
- "Race tests are flaky in CI" → flavor 2/3 are deterministic. Flaky flavor 1 means
  your test isn't isolating its DB/Redis state.
- "It's a unit test, mocks make it sequential" → see flavor 2 — mocks can simulate
  concurrency by sequencing return values.

## Templates

- [race-test.template.ts](../../../templates/race-test.template.ts)
