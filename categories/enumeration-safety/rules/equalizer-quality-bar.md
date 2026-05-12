---
title: Timing Equalizer Implementation Quality Bar
last-referenced: 2026-05-12
maturity: verified
type: guideline
impact: HIGH
impact-description: |
  A bad equalizer is worse than no equalizer because it gives a false sense of safety.
  The equalizer must use real CPU-bound work, must be invoked on EVERY early-return,
  and must have its own deterministic test.
tags: enumeration, timing, equalizer, bcrypt, testing
applies-to: |
  When implementing or maintaining the timing-equalizer helper itself.
related-rules:
  - timing-oracle
historical-incidents:
  - PR#85 round 1 (initial equalizer didn't cover the 503 branch)
---

## Quality bar checklist

A correct equalizer:

- ☐ Uses real CPU-bound work (bcrypt, scrypt, argon2). NOT setTimeout.
- ☐ Has a duration that meets-or-exceeds the longest legitimate-path latency.
- ☐ Is deterministic ±5% across runs on the same hardware.
- ☐ Is exercised on EVERY early-return branch (not-found, inactive, rate-limited, ambiguous, error swallowed).
- ☐ Has a parity test that proves equal mean wall-clock vs. the existing-account branch.
- ☐ Cannot be silently stripped (e.g., `if (process.env.SKIP_EQUALIZER)` is a backdoor).
- ☐ Is exported as a single, named, type-safe function — not inline in the controller.

## Implementation

```typescript
// apps/api/src/common/security/timing-equalizer.ts

import * as bcrypt from 'bcrypt';

const EQUALIZER_INPUT = 'timing-equalizer-dummy-value-do-not-change';
const EQUALIZER_ROUNDS = 12;  // matches our production password-hashing rounds

/**
 * Adds a constant ~150-250ms of CPU work to the current request, neutralizing
 * timing differences between branches that branch on a sensitive condition
 * (account exists / does not exist).
 *
 * Use on EVERY early-return path of an enumeration-sensitive endpoint.
 *
 * Implementation: bcrypt.hash with production-equivalent rounds. Real CPU work,
 * not setTimeout — variance-detectable timing primitives leak the same as no
 * equalizer.
 */
export async function equalizeBcryptTiming(): Promise<void> {
  await bcrypt.hash(EQUALIZER_INPUT, EQUALIZER_ROUNDS);
}
```

## Tests for the equalizer itself

```typescript
// apps/api/src/common/security/timing-equalizer.spec.ts

describe('equalizeBcryptTiming', () => {
  it('takes between 80ms and 500ms on a typical machine', async () => {
    const start = performance.now();
    await equalizeBcryptTiming();
    const duration = performance.now() - start;
    expect(duration).toBeGreaterThan(80);
    expect(duration).toBeLessThan(500);
  });

  it('is deterministic within ±50% across 10 runs', async () => {
    const durations: number[] = [];
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      await equalizeBcryptTiming();
      durations.push(performance.now() - start);
    }
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    const max = Math.max(...durations);
    const min = Math.min(...durations);
    expect(max).toBeLessThan(mean * 1.5);
    expect(min).toBeGreaterThan(mean * 0.5);
  });

  it('cannot be stripped by environment variable', () => {
    // Negative test: the function does NOT check process.env
    const fnSource = equalizeBcryptTiming.toString();
    expect(fnSource).not.toContain('process.env');
    expect(fnSource).not.toContain('NODE_ENV');
  });
});
```

## Audit checklist for callers

For every endpoint that uses the equalizer, verify (with grep) that the equalizer is
called on EVERY early-return path:

```bash
# For each call to requestPasswordReset / requestPasswordResetOtp:
# every `return` statement in the function MUST be preceded by an
# `await equalizeBcryptTiming()` call within ~5 lines (or be the success-path return)

grep -B 5 "return;" apps/api/src/modules/auth/auth.service.ts | grep -B 4 "return;" | grep -c "equalizeBcryptTiming"
```

This is a manual audit step at review. The rule's automated guard is the parity test
in `enumeration-test-suite.template.ts` — if any branch skips the equalizer, the parity
test fails.

## Anti-patterns

- `await new Promise(r => setTimeout(r, 300))` → variance-detectable, easily stripped
- `if (process.env.NODE_ENV === 'test') return; await bcrypt.hash(...)` → backdoor:
  testing in non-test env strips the equalizer; production NODE_ENV mistakes break security
- Calling the equalizer in only ONE branch → defeats the entire purpose
- Using a fixed-time `crypto.randomBytes(N).toString('hex')` instead → fast on modern CPUs,
  doesn't match bcrypt envelope
- Hashing dynamically-sized input → variance grows with input size
