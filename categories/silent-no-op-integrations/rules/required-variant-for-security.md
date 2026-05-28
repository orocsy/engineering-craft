---
title: Provide *Required() Variants for Security-Critical Call Sites
last-referenced: 2026-05-12
maturity: proven
type: guideline
impact: CRITICAL
impact-description: |
  Some call sites cannot accept "silently skipped." Password reset email is the
  canonical example: if it doesn't send, the user is locked out. The required variant
  THROWS instead of returning false, forcing the controller to handle the failure
  explicitly (and, with [status-code-oracle.md], swallow the error to preserve
  enumeration safety).
tags: integration, third-party, security-critical, required, password-reset
applies-to: |
  Call sites where silent skip means user-visible breakage: password reset, payment
  capture, two-factor verification, audit log writes.
related-rules:
  - configured-state-visible
  - status-code-oracle
historical-incidents:
  - a real incident: call site ignored sendEmail's return value, "delivered=false" bubbled up as silent success
---

## Why two variants

Many integrations have BOTH security-critical and best-effort call sites. Example:
- Resend `sendEmail` for marketing newsletter → best-effort; silent skip is fine
- Resend `sendEmail` for password reset → security-critical; silent skip = user lockout

The wrapper should expose:

```typescript
// Best-effort: returns { delivered: false } on miss; never throws.
async sendEmail(args): Promise<{ delivered: boolean }>;

// Security-critical: throws ServiceUnavailableException on miss; caller must handle.
async sendEmailRequired(args): Promise<void>;
```

## Why throw instead of return-and-let-caller-check

Two reasons:

1. **Caller can't forget to check.** Returning `{ delivered: boolean }` requires the
   call site to inspect and branch. People forget. A real incident had exactly this bug —
   the call site `await sendEmail(...)` ignored the return value, and "delivered=false"
   bubbled up as silent success.

2. **Stack trace points to the call site.** When the integration is misconfigured in
   prod (somehow past the env-schema), the throw happens at the exact line. With a
   return-value pattern, the symptom (user complaint about no email) is far from the
   cause.

## Pattern: required vs. optional

```typescript
@Injectable()
export class ResendService {
  // ... onModuleInit, isConfigured, sendEmail (best-effort) as in
  // configured-state-visible.md ...

  /**
   * Send an email and throw if the integration is not configured.
   * Use ONLY for security-critical sends where silent skip is unacceptable
   * (password reset, payment receipt, 2FA confirmation).
   */
  async sendEmailRequired(args: SendEmailArgs): Promise<void> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Email integration not configured — set RESEND_API_KEY and RESEND_FROM_EMAIL',
      );
    }
    const from = this.config.get<string>('RESEND_FROM_EMAIL');
    await this.client.emails.send({ from, ...args });
  }
}
```

## How it composes with status-code-oracle

The required variant throws 503. But for forgot-password endpoints, the controller
must swallow that 503 to preserve enumeration safety (see
[status-code-oracle.md](../../enumeration-safety/rules/status-code-oracle.md)).

Looks like:

```typescript
@Post('forgot-password')
@HttpCode(204)
async forgotPassword(@Body() dto) {
  try {
    await this.authService.requestPasswordReset(dto);  // calls sendEmailRequired internally
  } catch (e) {
    // Swallow ALL errors to preserve 204 contract.
    // The boot-time hard-fail (env schema) ensures we never reach here in prod.
    this.logger.warn({ err: e }, 'forgot-password: downstream failure swallowed');
  }
}
```

In production:
- Boot-time env schema requires RESEND_API_KEY → container can't start without it
- Therefore `sendEmailRequired` will never throw `ServiceUnavailableException` in prod
  (the integration is always configured)
- The catch block is a defense-in-depth for unexpected runtime failures (Resend HTTP
  500, network unreachable, etc.) — those still get swallowed for enumeration safety

In dev/test (no API key):
- Env schema allows missing key (NODE_ENV !== 'production')
- `sendEmailRequired` throws → caught by controller → logged → 204 returned
- Dev tests can spy on the warn log to verify the swallow happened

## Audit: which call sites need *Required?

Grep your codebase for every call to the integration and classify each:

```bash
grep -rn "sendEmail\|resend\.send" apps/api/src/ --include="*.ts"
```

For each match:
- Is the failure user-visible? → use `sendEmailRequired`
- Is the failure best-effort (e.g., notification, log, marketing)? → use `sendEmail`

When in doubt, use `*Required` — silent skip is rarely correct.

## Tests

```typescript
describe('sendEmailRequired', () => {
  it('throws ServiceUnavailableException when integration is DISABLED', async () => {
    process.env.RESEND_API_KEY = '';
    service.onModuleInit();
    await expect(
      service.sendEmailRequired({ to: 'a@b.com', subject: 'x', html: 'y' }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('actually sends when integration is LIVE', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_EMAIL = 'noreply@test.com';
    service.onModuleInit();
    const sendSpy = jest.spyOn(service['client']!.emails, 'send').mockResolvedValue({ data: { id: 'x' }, error: null } as any);
    await service.sendEmailRequired({ to: 'a@b.com', subject: 'x', html: 'y' });
    expect(sendSpy).toHaveBeenCalled();
  });
});
```

## Anti-patterns

- "I'll just always throw if not configured (no separate variant)" — breaks marketing/
  notification call sites where silent skip is correct
- "I'll add a runtime config check at the controller level" — duplicates logic; misses
  call sites that aren't controllers
- "I'll log error at the call site" — logs ≠ throws; logs don't fail-fast
- "*Required is implied by the call site context" — implicit conventions get violated;
  make it explicit in the API
