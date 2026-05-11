---
title: Configured State Must Be Visible at Boot
impact: CRITICAL
impact-description: |
  A wrapper that silently no-ops when its API key is missing is the worst possible
  failure mode. Print LIVE/DISABLED to stdout at boot so ops sees the state.
tags: integration, third-party, boot-log, observability, resend, twilio, stripe
applies-to: |
  Every wrapper around a third-party HTTP API: Resend, Twilio, Stripe, S3, OAuth
  providers, push-notification services, analytics SDKs.
related-rules:
  - required-variant-for-security
  - regression-test-the-no-op
historical-incidents:
  - Pre-PR#85 (sendEmail silent no-op)
---

## The discipline

Every integration wrapper does THREE things at construction time:

1. Reads the relevant env vars
2. Decides if it's "configured" (LIVE) or "not configured" (DISABLED)
3. **Prints a single line to stdout naming the integration and its state**

## Implementation

```typescript
// apps/api/src/integrations/resend.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class ResendService implements OnModuleInit {
  private readonly logger = new Logger(ResendService.name);
  private client: Resend | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from   = this.config.get<string>('RESEND_FROM_EMAIL');

    if (!apiKey || !from) {
      this.logger.warn(
        { integration: 'Resend', mode: 'DISABLED', reason: 'missing RESEND_API_KEY or RESEND_FROM_EMAIL' },
        'Resend integration: DISABLED — emails will not be sent',
      );
      return;
    }

    this.client = new Resend(apiKey);
    this.logger.log(
      { integration: 'Resend', mode: 'LIVE', from },
      'Resend integration: LIVE',
    );
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async sendEmail(args: SendEmailArgs): Promise<{ delivered: boolean }> {
    if (!this.client) {
      this.logger.warn({ to: args.to }, 'Resend not configured — email skipped');
      return { delivered: false };
    }
    const { from } = this.config.get('RESEND_FROM_EMAIL');
    await this.client.emails.send({ from, ...args });
    return { delivered: true };
  }

  async sendEmailRequired(args: SendEmailArgs): Promise<void> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Email integration not configured — set RESEND_API_KEY and RESEND_FROM_EMAIL',
      );
    }
    const { from } = this.config.get('RESEND_FROM_EMAIL');
    await this.client.emails.send({ from, ...args });
  }
}
```

## Why log structured (not just text)

Two reasons:

1. Log aggregation (Datadog, CloudWatch, etc.) parses structured logs to surface
   `integration=Resend mode=DISABLED` as a queryable field. You can build alerts on
   it.

2. CI tests can grep for the exact log shape:
```typescript
it('logs LIVE when configured', async () => {
  process.env.RESEND_API_KEY = 're_test';
  process.env.RESEND_FROM_EMAIL = 'a@b.com';
  const logSpy = jest.spyOn(Logger.prototype, 'log');
  service.onModuleInit();
  expect(logSpy).toHaveBeenCalledWith(
    expect.objectContaining({ integration: 'Resend', mode: 'LIVE' }),
    'Resend integration: LIVE',
  );
});

it('logs DISABLED when missing API key', async () => {
  delete process.env.RESEND_API_KEY;
  const warnSpy = jest.spyOn(Logger.prototype, 'warn');
  service.onModuleInit();
  expect(warnSpy).toHaveBeenCalledWith(
    expect.objectContaining({ integration: 'Resend', mode: 'DISABLED' }),
    expect.stringContaining('DISABLED'),
  );
});
```

## Pair with env schema hard-fail

The boot log is one layer; the other is env-schema hard-fail in production:

```typescript
// apps/api/src/config/env.schema.ts
.superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production' && !data.RESEND_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['RESEND_API_KEY'],
      message: 'Required in production — owner password reset and customer OTP cannot deliver email without it.',
    });
  }
});
```

The schema fails BEFORE the wrapper constructs. So in production:
- Missing key → schema fails → container exits 1 → CrashLoopBackOff → ops gets paged
- Misconfigured key → schema passes, wrapper constructs LIVE, logs LIVE, send call hits
  Resend → Resend returns auth error → real error visible

In dev/test:
- Missing key → schema allows, wrapper logs DISABLED, calls are skipped → dev sees
  obvious "DISABLED" in their startup log

## Anti-patterns

- "I'll log warn at every call site if not configured" — logs are noise; the boot log
  is the single point of truth
- "I'll throw at construction if not configured in prod" — that's the env-schema's job;
  the wrapper's job is observability
- "I'll add an `enabled: false` flag in env" — fine, but the resolution still goes
  through the same logic; the flag is one more thing to check
- "I'll do the check inside `sendEmail`" — that's already in the rule, but the BOOT-TIME
  log is what makes the state visible to ops without requiring a request
