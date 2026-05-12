---
title: Timing Oracle — Equal Wall-Clock Envelope on Both Branches
last-referenced: 2026-05-12
maturity: proven
type: pitfall
impact: CRITICAL
impact-description: |
  If the existing-account branch awaits an outbound HTTP call (200-2000ms) while the
  not-found branch returns after ~5ms of DB lookup, you've leaked existence even with
  a constant 204. Real-world detectable with sub-100ms accuracy at 1000 samples.
tags: enumeration, timing, oracle, bcrypt, equalizer
applies-to: |
  Any endpoint where one branch does meaningfully more work than the other. Always
  check: forgot-password, forgot-username, login, magic-link issuance, account
  creation.
related-rules:
  - status-code-oracle
  - equalizer-quality-bar
historical-incidents:
  - PR#85 round 2 (email-send latency oracle) [11fb1aa]
---

## Why this matters

Even with identical status codes and bodies, two branches that take meaningfully
different wall-clock time leak the underlying condition. With statistical analysis of
100-1000 samples, attackers can detect differences of 50ms or less.

The most common version of this bug:

```typescript
// ❌ Existing account: ~500ms to send the email
// Not-found:        ~5ms (just a Postgres lookup)
async requestPasswordReset({ email }) {
  const user = await this.prisma.user.findFirst({ where: { email, isActive: true } });
  if (!user) return; // ← returns after ~5ms

  const link = this.signResetLink(user);
  await this.resend.send({ to: user.email, ... }); // ← awaits ~500ms
}
```

The attacker sends 100 candidate emails, measures response times, builds a histogram,
trivially identifies the bimodal distribution. Existing accounts cluster around 500ms,
non-existing around 5ms. Done.

## Correct

```typescript
// ✅ Fire-and-forget the email + always run a constant-cost dummy work.
async requestPasswordReset({ email }) {
  const candidates = await this.prisma.user.findMany({
    where: { email, isActive: true },
    select: { id: true, tenantId: true, email: true },
  });

  if (candidates.length !== 1) {
    await this.equalizeBcryptTiming();  // ~300ms constant CPU
    return;
  }

  const user = candidates[0];
  const link = this.signResetLink(user);

  // Fire-and-forget: don't await the network round trip
  void this.resend.send({ to: user.email, ... }).catch((e) =>
    this.logger.warn({ err: e, userId: user.id }, 'reset email send failed'),
  );

  // Always run the same constant-cost work as the not-found branch
  await this.equalizeBcryptTiming();  // ~300ms constant CPU
}
```

## The equalizer

The equalizer is a CPU-bound operation that takes a constant, predictable time. It
must:

1. **Run REAL bcrypt** (or equivalent CPU-bound work). Do NOT use `setTimeout` — it's
   variance-detectable (event loop lag) and easy to mock out (an attacker could detect
   if you stripped it via NODE_OPTIONS shenanigans).

2. **Match the wall-clock envelope of the LONGEST legitimate path**. If your existing-
   account branch takes 300-500ms (network jitter), your equalizer must run for at
   least 300ms.

3. **Be exercised on EVERY early-return branch**. Not-found, inactive, rate-limited,
   ambiguous-multi-tenant — all of them.

4. **Be deterministic across calls**. Variance ≠ noise floor. If your equalizer takes
   200-400ms randomly, the existing-account branch is still distinguishable as
   "300-700ms wide" vs "200-400ms wide."

The simplest implementation:
```typescript
private async equalizeBcryptTiming(): Promise<void> {
  // Hash a fixed dummy value at production-equivalent rounds
  await bcrypt.hash('dummy-equalizer-input', this.BCRYPT_ROUNDS);
}
```

`bcrypt.hash` at rounds=10-12 takes ~70-200ms on commodity hardware, deterministic
within ±5%. For safety, run it twice or compute a longer value to bring the constant
above the longest legitimate path.

## Why fire-and-forget the email?

Two reasons:
1. **Latency parity**: not awaiting Resend means both branches return at the same time.
2. **Failure isolation**: Resend down doesn't cause the request to fail. (Combined with
   [status-code-oracle.md](status-code-oracle.md) and the boot-time hard-fail, this is
   the safe default.)

You DO need to log fire-and-forget failures so ops can detect outages.

## Tests that prove it

```typescript
it('returns within the same wall-clock envelope for known and unknown emails', async () => {
  const measure = async (email: string) => {
    const start = performance.now();
    await request(app).post('/auth/forgot-password').send({ email });
    return performance.now() - start;
  };

  // Run 20 samples each; mean comparison with tolerance
  const knownTimes = await Promise.all(Array.from({ length: 20 }, () => measure(knownEmail)));
  const unknownTimes = await Promise.all(Array.from({ length: 20 }, () => measure(unknownEmail)));

  const meanKnown = knownTimes.reduce((a, b) => a + b, 0) / knownTimes.length;
  const meanUnknown = unknownTimes.reduce((a, b) => a + b, 0) / unknownTimes.length;
  const meanDelta = Math.abs(meanKnown - meanUnknown);

  expect(meanDelta).toBeLessThan(150); // tolerance accounts for natural CPU variance
});
```

The tolerance is generous (150ms) because CI machines have noisy timing. The
production reality is the variance must be smaller than the smallest detectable
statistical difference, which is roughly `std_dev / sqrt(N)` — at N=1000 samples and
std_dev=50ms, attackers can distinguish 1.5ms differences. Aim for the means to be
within 50ms in test, knowing CI noise inflates that.

## Anti-patterns

- "I'll use `setTimeout(300)` instead of bcrypt" → variance-detectable (event loop),
  trivially stripped by anyone modifying production NODE_OPTIONS
- "300ms is overkill for a forgot-password flow" → it's the floor for security; UX
  cost is one HTTP round trip
- "I'll only equalize the email-down case" → no — equalize EVERY early-return branch
- "The attacker can't time precisely" — yes they can, with stats
- "We don't have a real attacker" → enumeration is a primitive used in spearphishing,
  credential stuffing, and account-takeover. You will be targeted.

## Templates

- [enumeration-test-suite.template.ts](../../../templates/enumeration-test-suite.template.ts)

## References

- OWASP timing attacks: https://owasp.org/www-community/attacks/Timing_attacks
- bcrypt timing characteristics: https://github.com/kelektiv/node.bcrypt.js#a-note-on-timing-attacks
