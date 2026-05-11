# New Third-Party Integration Checklist

Run this when wrapping ANY external service: Resend, Twilio, Stripe, S3, OAuth
provider, push notifications, analytics SDK, or anything that calls out to an
external HTTP API.

## Step 1 — env vars

Follow the [new-env-var.md](new-env-var.md) checklist for every config field the
integration needs:

- API key
- Region / endpoint URL
- Webhook secret
- Default sender / sender ID

For most integrations, that's 1-3 vars. ALL must be wired through every consumer.

## Step 2 — wrapper service

Create a NestJS service that wraps the SDK with three required behaviors:

### A — boot-time mode log (LIVE / DISABLED)

```typescript
onModuleInit() {
  const apiKey = this.config.get<string>('THIRD_PARTY_API_KEY');
  if (!apiKey) {
    this.logger.warn(
      { integration: 'ThirdParty', mode: 'DISABLED', reason: 'missing THIRD_PARTY_API_KEY' },
      'ThirdParty integration: DISABLED — calls will be skipped',
    );
    return;
  }
  this.client = new ThirdPartySDK(apiKey);
  this.logger.log(
    { integration: 'ThirdParty', mode: 'LIVE', keyPrefix: apiKey.slice(0, 4) + '…' },
    'ThirdParty integration: LIVE',
  );
}
```

- [ ] Structured log with `{ integration, mode }` fields
- [ ] LIVE log shows safe metadata (key prefix, region) but NEVER the full secret
- [ ] DISABLED log includes the reason (which env var was missing)

### B — best-effort variant + required variant

```typescript
async doStuff(args): Promise<{ delivered: boolean }>;     // returns false if DISABLED
async doStuffRequired(args): Promise<void>;               // throws 503 if DISABLED
```

- [ ] `doStuff` returns `{ delivered: boolean }` (or similar shape) — never throws on DISABLED
- [ ] `doStuffRequired` throws `ServiceUnavailableException` on DISABLED — never silently skips
- [ ] Security-critical call sites use `doStuffRequired` (verify with grep)
- [ ] Best-effort call sites use `doStuff` (notifications, marketing, analytics)

### C — env-schema hard-fail in production

Add to `env.schema.ts` `superRefine`:

```typescript
if (data.NODE_ENV === 'production' && !data.THIRD_PARTY_API_KEY) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['THIRD_PARTY_API_KEY'],
    message:
      'Required in production — <one-sentence: what breaks>. ' +
      'Set the GitHub secret THIRD_PARTY_API_KEY and pass it through deploy.yml.',
  });
}
```

- [ ] Production environment cannot start without the key (Zod fails container boot)
- [ ] Dev/test environments may run without the key (DISABLED mode)

## Step 3 — tests (BOTH branches)

Cover the 4-cell matrix from [regression-test-the-no-op.md](../categories/silent-no-op-integrations/rules/regression-test-the-no-op.md):

- [ ] LIVE: success path — wrapper forwards to SDK with correct args
- [ ] LIVE: SDK error — wrapper propagates (or wraps) the error
- [ ] DISABLED: best-effort variant returns `{ delivered: false }`, does NOT call SDK
- [ ] DISABLED: required variant throws `ServiceUnavailableException`, does NOT call SDK
- [ ] Boot log assertion: structured log emitted with correct fields in both modes

## Step 4 — integrate carefully

When you wire the new wrapper into a feature:

- [ ] Audit: every call site uses the correct variant for its criticality
- [ ] If the call site is in an enumeration-sensitive endpoint (forgot-password style):
      controller swallows the throw to preserve the status-code oracle
- [ ] If the call is awaited in a path that has timing-parity requirements: consider
      fire-and-forget with `.catch(logSwallow)` and equalizer (see [timing-oracle.md](../categories/enumeration-safety/rules/timing-oracle.md))

## Step 5 — operational

- [ ] Health endpoint check: `/health` reports the integration's reachability (so
      ops can monitor without parsing logs)
- [ ] Metric: `<integration>_call_failures{reason}` counter incremented in the
      wrapper's catch path
- [ ] Alert wired: e.g., "Resend 503 rate > 1% over 5 minutes" → page on-call

## Anti-patterns

- "I'll silently no-op so devs without the key can run the app" — exact failure mode
  that bit PR#85
- "I'll just throw if not configured everywhere" — breaks marketing/notification call
  sites where silent skip is correct
- "I'll add a runtime check at the controller" — duplicates logic; misses non-controller
  call sites
- "Tests verify it works" — tests verify the LIVE branch only; the DISABLED branch
  drifts undetected for months

## References

- [silent-no-op-integrations/README.md](../categories/silent-no-op-integrations/README.md)
- [integration-boot-log.template.ts](../templates/integration-boot-log.template.ts)
