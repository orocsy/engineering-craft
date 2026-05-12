---
title: GitHub Actions Substitutes Empty String, Not Undefined — Optional Env Needs Preprocess
type: pitfall
maturity: proven
last-referenced: 2026-05-12
impact: HIGH
impact-description: |
  GH Actions emits literal `""` for unset secrets, not undefined. Zod `.optional()`
  only handles undefined → schema rejects empty strings as invalid type → boot fail.
  Plus the four-consumer-rule (env.schema, GH Secret, deploy.yml, code site) needs to
  be FIVE consumers — `.env.example` is the fifth. Five separate prod outages traced
  here.
tags: config, env, zod, github-actions, deploy, surfaces
applies-to: |
  Adding any new env var. Tightening a Zod validator on an existing var. Changing
  the optionality of an env var.
related-rules:
  - four-consumer-rule
  - secret-existence-vs-exposure
  - env-deploy-parity-test
historical-incidents:
  - ce35b7f — Stripe envs required at Zod startup but optional secret in GH Actions; EC2 boot crash
  - 418c867 — GH Actions emits literal "" for unset secrets, not undefined; Zod .optional() only handles undefined; rejected empty strings; boot fail
  - 4cc5e25 — deploy.yml missing 5 docker -e pass-throughs (STRIPE_BILLING_ENABLED, ADMIN_APP_URL, RESEND_FROM_EMAIL, etc.); billing stayed disabled in prod
  - 89bffb6 — CUSTOMER_CONTACT_HASH_SECRET env-schema-required-in-prod but missing from deploy.yml -e list (Codex round 4)
  - 711d1ab — API_PUBLIC_URL required-in-prod superRefine but not wired into deploy.yml; 3-min HTTP 000 outage
---

## Why this matters

Two patterns combine to make env config fragile:

1. **The "five surfaces" reality** (extends [four-consumer-rule](four-consumer-rule.md)).
   An env var has at minimum FIVE places that must agree:
   - `apps/api/src/config/env.schema.ts` — Zod validator
   - GitHub Secrets — actual secret value
   - `.github/workflows/deploy.yml` — `-e VAR="${{ secrets.VAR }}"` flag
   - Code call-site — `process.env.VAR` consumer
   - `apps/api/.env.example` — local-dev placeholder

   Miss any one, prod breaks at boot.

2. **The empty-string trap**. GitHub Actions doesn't emit "the secret is undefined";
   it emits the literal empty string `""` when a secret is unset OR when the YAML
   doesn't reference it. Zod `.optional()` only handles `undefined`, so:

```typescript
// ❌ Validates only against the missing case, not the empty-string case
const envSchema = z.object({
  RESEND_API_KEY: z.string().optional(),
});
// In production with unset GH Secret: process.env.RESEND_API_KEY === ""
// Zod parses "" as "string of length 0" — passes validation
// Code does `if (!apiKey) noOp()` — bypasses the integration silently
// OR Zod has .url() / .min(1) — rejects "" as invalid type, BOOT FAIL
```

## Required reflexes

### Preprocess every optional env

```typescript
import { z } from 'zod';

// Treats "" as undefined for validation purposes
const optionalEnv = (schema: z.ZodTypeAny) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const envSchema = z.object({
  // ✅ "" → undefined → passes optional check
  RESEND_API_KEY: optionalEnv(z.string().min(20).startsWith('re_')),

  // For required-in-prod: combine with superRefine
  CUSTOMER_CONTACT_HASH_SECRET: optionalEnv(z.string().min(16)),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production' && !data.CUSTOMER_CONTACT_HASH_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CUSTOMER_CONTACT_HASH_SECRET'],
      message: 'Required in production — keys the HMAC for OTP storage',
    });
  }
});
```

The `optionalEnv` wrapper means dev environments without the var still pass; prod
without the var hard-fails with a clear error message.

### Five-surface checklist (extends [four-consumer-rule](four-consumer-rule.md))

When you add or change an env var, in the SAME commit:

- [ ] `env.schema.ts` — added to schema with `optionalEnv()` wrapper
- [ ] If production-required: `superRefine` block with error message
- [ ] GitHub Secret created (`gh secret list -R owner/repo | grep VAR_NAME` confirms)
- [ ] `.github/workflows/deploy.yml` — `-e VAR="${{ secrets.VAR }}"` flag added to docker run
- [ ] `apps/api/.env.example` — placeholder added
- [ ] Code call-site uses `config.get('VAR')` (NestJS) or destructured `env`
- [ ] Test fixtures (`buildValidEnv`, etc.) updated
- [ ] Runbook / docs updated
- [ ] Parity test ([env-deploy-parity-test](env-deploy-parity-test.md)) re-runs and passes

### Tighten validators carefully

When you tighten a regex or format on an existing env var, audit currently-persisted
values FIRST:

```bash
# Find every prod-set value of the var (sample from secret list metadata, or pull
# from the deploy logs of recent successful runs)
gh run view <last-successful-deploy> -R owner/repo --log | grep "VAR_NAME"
```

If existing values won't match the new validator, run a one-shot migration OR build
an explicit "accept legacy on read, write only canonical" path. Don't ship a
tightened validator and discover at boot that the production secret is rejected.

## Tests

Add a CI test that validates **boot-time env parsing with the GH Actions empty-string substitution**:

```typescript
// env.schema.spec.ts
describe('production env parsing', () => {
  it('rejects unset required prod secrets (empty string from GH Actions)', () => {
    const env = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://x',
      JWT_SECRET: '...',
      CUSTOMER_CONTACT_HASH_SECRET: '', // ← simulates unset GH Secret
    };
    const result = envSchema.safeParse(env);
    expect(result.success).toBe(false);
    expect(result.error?.issues.find((i) => i.path[0] === 'CUSTOMER_CONTACT_HASH_SECRET'))
      .toBeDefined();
  });

  it('accepts unset optional dev vars (empty string treated as undefined)', () => {
    const env = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://x',
      RESEND_API_KEY: '', // ← simulates dev without the secret
    };
    const result = envSchema.safeParse(env);
    expect(result.success).toBe(true);
  });
});
```

## Anti-patterns

- "GH Actions handles missing secrets gracefully" — yes, by emitting `""`. Your
  Zod doesn't.
- ".optional() means it's fine without" — only for `undefined`, not for `""`
- "I'll add the deploy.yml line later" — see PR#85 round 4
- "The secret is set, that's enough" — see secret-existence-vs-exposure for why
  existence ≠ exposure
- "I'll tighten the validator and migrate later" — boot-time validation runs FIRST;
  prod is down for the duration

## Templates

- [env-deploy-parity.spec.template.ts](../../../templates/env-deploy-parity.spec.template.ts)
- [secret-existence-vs-exposure.md](secret-existence-vs-exposure.md)
