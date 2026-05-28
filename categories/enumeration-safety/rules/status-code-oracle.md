---
title: Status-Code Oracle — Same Status on Both Branches Under ALL Failure Modes
last-referenced: 2026-05-12
maturity: proven
type: pitfall
impact: CRITICAL
impact-description: |
  If your endpoint contract says "always returns 204," ANY non-204 (including 503,
  500, 502, 504) on one branch but not the other is an existence oracle. A real
  incident surfaced this because email-provider downtime would 503 only the
  existing-account branch.
tags: enumeration, status-code, oracle, password-reset, forgot-password
applies-to: |
  Any endpoint with a "look the same regardless of input" contract: forgot-password,
  forgot-username, magic-link issuance, password-reset, email-confirmation-resend.
related-rules:
  - timing-oracle
  - multi-tenant-fail-closed
historical-incidents:
  - forgot-password review round — email-provider 503 leaked existence via status-code divergence
---

## Why this matters

Forgot-password endpoints follow the OWASP convention: "always return the same response,
regardless of whether the email exists." This prevents an attacker from enumerating valid
emails by submitting candidates and watching which return success.

The leak happens when downstream services fail differently on the two branches:
- Existing email → service queues an email send via Resend → Resend is down → throws 503.
- Nonexisting email → no email send → returns 204 cleanly.

Now `503 vs 204` IS the oracle, even though the developer "correctly" returns 204 on
the happy path.

## Incorrect

```typescript
// ❌ Resend down → 503 only on existing-account branch.
@Post('forgot-password')
@HttpCode(204)
async forgotPassword(@Body() dto: ForgotPasswordDto) {
  try {
    await this.authService.requestPasswordReset(dto);
  } catch (e) {
    if (e instanceof ServiceUnavailableException) throw e;  // ← LEAKS
    if (e instanceof InternalServerErrorException) throw e; // ← LEAKS
    this.logger.warn(e);
  }
}
```

The "I'll let 503 propagate so ops can see Resend is down" reflex is wrong. The 503 IS
the existence oracle. Ops can see Resend is down via:
- The boot log
- The structured warn log inside the catch (with severity tags)
- A separate health endpoint
- Resend's own status page / dashboard

The forgot-password contract is "always 204." Anything else leaks.

## Correct

```typescript
// ✅ Swallow EVERY error. The contract is unconditional 204.
@Post('forgot-password')
@HttpCode(204)
async forgotPassword(@Body() dto: ForgotPasswordDto) {
  try {
    await this.authService.requestPasswordReset(dto);
  } catch (e) {
    // Log loudly so ops know about Resend outages, BUT do not re-throw.
    this.logger.warn(
      { err: e, email_hash: hashForLog(dto.email) },
      'forgot-password: downstream failure swallowed to preserve enumeration safety',
    );
  }
}
```

## Doesn't this mask real bugs?

No, because:
1. **Boot-time validation**: The env schema (`apps/api/src/config/env.schema.ts`) hard-fails
   container start if `RESEND_API_KEY` is missing in production. So the API can't even
   START with a broken config.
2. **Logging**: Every swallowed error is logged at WARN with structured context.
3. **Separate health endpoint**: `/api/v1/health` returns 503 if Resend is unreachable —
   that's the right place for "downstream is down" signals, not a user-facing endpoint.
4. **Metrics**: Track `forgot_password_send_failures{reason="resend_503"}` and alert on
   it. The metric is the oracle for ops, not the response.

## What about other status codes that vary?

Audit every codepath:
- 400 (validation error) — same for both branches if input shape is the same. Check.
- 429 (rate limit) — same for both branches if you rate-limit BEFORE the user lookup.
- 500 (DB error) — should be same; both branches do the user lookup.
- 503 (downstream) — only existing branch awaits email send; needs swallowing.

Write the test:
```typescript
it('returns 204 even when Resend throws 503', async () => {
  mockResend.send.mockRejectedValue(new ServiceUnavailableException('Resend down'));

  const knownEmailResp = await request(app).post('/auth/forgot-password').send({ email: knownEmail });
  const unknownEmailResp = await request(app).post('/auth/forgot-password').send({ email: unknownEmail });

  expect(knownEmailResp.status).toBe(204);
  expect(unknownEmailResp.status).toBe(204);
  expect(knownEmailResp.body).toEqual(unknownEmailResp.body);
});
```

## What about response BODY size?

Empty 204 has no body — `Content-Length: 0`. Both branches return identical bytes.
Verify in tests:
```typescript
expect(knownEmailResp.headers['content-length']).toBe(unknownEmailResp.headers['content-length']);
```

## Anti-patterns

- "I'll log and then re-throw" → re-throwing IS the leak, regardless of logging
- "I'll return 200 instead of 204 to be friendlier" → fine, but pick ONE and use both branches
- "I'll only swallow ServiceUnavailableException" → other exceptions also leak; swallow ALL
- "Throwing helps ops debug" → ops have logs, metrics, health endpoints; the user-facing
  contract is not the place
- "It's OK because the attacker doesn't know we use Resend" → security through obscurity
