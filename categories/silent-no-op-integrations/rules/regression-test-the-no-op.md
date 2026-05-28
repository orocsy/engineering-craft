---
title: Regression-Test the No-Op Branch
last-referenced: 2026-05-12
maturity: verified
type: process
impact: HIGH
impact-description: |
  The integration has TWO branches: LIVE (sends real call) and DISABLED (returns
  early). Every wrapper test suite must cover BOTH. Otherwise the no-op branch
  drifts undetected for months.
tags: integration, testing, no-op, regression
applies-to: |
  Every test suite for a third-party API wrapper.
related-rules:
  - configured-state-visible
  - required-variant-for-security
historical-incidents:
  - a real incident: sendEmail no-op went undetected for months
---

## Why this matters

Tests that mock the third-party SDK verify the LIVE branch — the wrapper translates the
caller's args into the SDK's call shape correctly. They do NOT verify the DISABLED
branch — the wrapper short-circuits cleanly when the API key is missing.

If the no-op branch is broken (e.g., it throws instead of returning, or it returns the
wrong shape), tests pass and the bug ships. In a real incident, a `sendEmail` wrapper had
been returning `false` from the no-op branch for months; nobody noticed because the call
sites that depended on it didn't have prod-environment-equivalent tests.

## Test matrix

For each wrapper, write at minimum these 4 cases:

| Case | Setup | Expected |
|------|-------|----------|
| LIVE: success | API key set, SDK mock returns success | Method resolves; SDK called with right args |
| LIVE: SDK error | API key set, SDK mock throws | Method propagates the error (or wraps it) |
| DISABLED: best-effort variant | API key UNSET | Method resolves with `{ delivered: false }`, SDK NOT called |
| DISABLED: required variant | API key UNSET | Method throws `ServiceUnavailableException`, SDK NOT called |

## Implementation

```typescript
describe('ResendService', () => {
  let service: ResendService;
  let configService: ConfigService;
  let mockSend: jest.Mock;

  function setup({ apiKey, from }: { apiKey?: string; from?: string }) {
    configService = {
      get: jest.fn((key) => {
        if (key === 'RESEND_API_KEY') return apiKey;
        if (key === 'RESEND_FROM_EMAIL') return from;
        return undefined;
      }),
    } as any;
    service = new ResendService(configService);
    service.onModuleInit();
    if (service['client']) {
      mockSend = jest.spyOn(service['client'].emails, 'send').mockResolvedValue({ data: { id: 'x' }, error: null } as any);
    }
  }

  describe('LIVE mode', () => {
    beforeEach(() => setup({ apiKey: 're_test', from: 'noreply@test.com' }));

    it('sendEmail forwards to SDK with correct args', async () => {
      await service.sendEmail({ to: 'a@b.com', subject: 'S', html: '<p>H</p>' });
      expect(mockSend).toHaveBeenCalledWith({
        from: 'noreply@test.com',
        to: 'a@b.com',
        subject: 'S',
        html: '<p>H</p>',
      });
    });

    it('sendEmail returns delivered:true on success', async () => {
      const result = await service.sendEmail({ to: 'a@b.com', subject: 'S', html: '<p>H</p>' });
      expect(result).toEqual({ delivered: true });
    });

    it('sendEmail propagates SDK errors', async () => {
      mockSend.mockRejectedValue(new Error('Resend 500'));
      await expect(service.sendEmail({ to: 'a@b.com', subject: 'S', html: '<p>H</p>' })).rejects.toThrow('Resend 500');
    });

    it('sendEmailRequired forwards to SDK with correct args', async () => {
      await service.sendEmailRequired({ to: 'a@b.com', subject: 'S', html: '<p>H</p>' });
      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('DISABLED mode (no API key)', () => {
    beforeEach(() => setup({}));

    it('sendEmail returns delivered:false without calling SDK', async () => {
      const result = await service.sendEmail({ to: 'a@b.com', subject: 'S', html: '<p>H</p>' });
      expect(result).toEqual({ delivered: false });
      // SDK was never instantiated, so no call to verify — but assert the no-throw path
    });

    it('sendEmail does not throw', async () => {
      await expect(service.sendEmail({ to: 'a@b.com', subject: 'S', html: '<p>H</p>' })).resolves.not.toThrow();
    });

    it('sendEmailRequired throws ServiceUnavailableException', async () => {
      await expect(service.sendEmailRequired({ to: 'a@b.com', subject: 'S', html: '<p>H</p>' }))
        .rejects.toThrow(ServiceUnavailableException);
    });

    it('boot logs DISABLED with structured payload', () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      service.onModuleInit();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ integration: 'Resend', mode: 'DISABLED' }),
        expect.stringContaining('DISABLED'),
      );
    });
  });
});
```

## Cross-test coverage

Beyond the wrapper unit tests, the call-site integration tests should also verify the
DISABLED branch is wired correctly:

```typescript
describe('AuthService.requestPasswordReset (Resend DISABLED)', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = '';  // simulate prod misconfig that survived schema (impossible in prod, but defensive)
    resendService.onModuleInit();
  });

  it('still completes and returns 204 even though email cannot be sent', async () => {
    // Verify the controller swallows the ServiceUnavailableException
    const resp = await request(app).post('/auth/forgot-password').send({ email: knownEmail });
    expect(resp.status).toBe(204);
  });
});
```

## Anti-patterns

- "I tested the LIVE branch with mocks; that proves it works" — proves contract
  delivery, not actual delivery
- "I'll add the no-op test later" — never happens
- "If RESEND_API_KEY is unset I throw, no need for the no-op branch" — your wrapper
  has no DISABLED mode then; document that as a constraint and remove the
  `if (!apiKey) return` branch entirely
