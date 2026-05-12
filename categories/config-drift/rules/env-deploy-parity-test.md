---
title: CI Test That Fails If Env Schema and Deploy.yml Drift
last-referenced: 2026-05-12
maturity: verified
type: process
impact: HIGH
impact-description: |
  Catches "added env to schema, forgot to add to deploy.yml" at validation gate, before
  the next deploy crashes at boot. PR#85 round 4 would have failed this test in CI
  instead of waiting for Codex review.
tags: config, env, deploy, ci, parity-test
applies-to: |
  Add this test to the API project's test suite. Run on every PR.
related-rules:
  - four-consumer-rule
  - secret-existence-vs-exposure
historical-incidents:
  - PR#85 round 4 [89bffb6] — CUSTOMER_CONTACT_HASH_SECRET in env.schema but missing from deploy.yml; this test catches that class
---

## What this test does

Reads `env.schema.ts` and `.github/workflows/deploy.yml` as text, finds every env var
declared production-required in the schema, and asserts that deploy.yml has a
`-e VAR="${{ secrets.VAR }}"` line for it.

## Implementation

```typescript
// apps/api/src/config/env.schema.spec.ts (or env-parity.spec.ts)
import { readFileSync } from 'fs';
import { join } from 'path';

describe('env schema ↔ deploy.yml parity', () => {
  const projectRoot = join(__dirname, '..', '..', '..', '..', '..');
  const schemaSrc = readFileSync(
    join(projectRoot, 'apps', 'api', 'src', 'config', 'env.schema.ts'),
    'utf-8',
  );
  const deploySrc = readFileSync(
    join(projectRoot, '.github', 'workflows', 'deploy.yml'),
    'utf-8',
  );

  /**
   * Find env vars declared production-required by parsing superRefine blocks of the form:
   *   if (data.NODE_ENV === 'production' && !data.VAR_NAME) { ... }
   */
  const requiredVars = Array.from(
    schemaSrc.matchAll(/data\.NODE_ENV\s*===\s*['"]production['"]\s*&&\s*!data\.(\w+)/g),
    (m) => m[1],
  );

  // Sanity check that the regex actually found something — guards against schema refactor
  // that breaks the regex pattern silently.
  it('finds at least 3 production-required vars in env.schema.ts', () => {
    expect(requiredVars.length).toBeGreaterThanOrEqual(3);
  });

  it.each(requiredVars)(
    '%s is passed through deploy.yml as `-e <VAR>="${{ secrets.<VAR> }}"`',
    (varName) => {
      const pattern = new RegExp(
        // accept both single and double quotes, and tolerate whitespace
        `-e\\s+${varName}\\s*=\\s*["']\\s*\\$\\{\\{\\s*secrets\\.${varName}\\s*\\}\\}\\s*["']`,
      );
      expect(deploySrc).toMatch(pattern);
    },
  );
});
```

## Test output when it fails

```
FAIL  src/config/env.schema.spec.ts
  env schema ↔ deploy.yml parity
    ✓ finds at least 3 production-required vars in env.schema.ts (8 ms)
    ✓ JWT_SECRET is passed through deploy.yml... (3 ms)
    ✓ RESEND_API_KEY is passed through deploy.yml... (2 ms)
    ✓ RESEND_FROM_EMAIL is passed through deploy.yml... (2 ms)
    ✗ CUSTOMER_CONTACT_HASH_SECRET is passed through deploy.yml... (4 ms)
       Expected pattern matching `-e CUSTOMER_CONTACT_HASH_SECRET=...secrets.CUSTOMER_CONTACT_HASH_SECRET...`

       Run: gh secret list -R owner/repo | grep CUSTOMER_CONTACT_HASH_SECRET
       Then: add `-e CUSTOMER_CONTACT_HASH_SECRET="${{ secrets.CUSTOMER_CONTACT_HASH_SECRET }}" \` to deploy.yml
```

## Extending to additional consumers

If your project also has Vercel project env vars or `.env.example`, add equivalent
parity tests:

```typescript
it.each(requiredVarsForFrontend)(
  '%s is documented in apps/admin/.env.example',
  (varName) => {
    const example = readFileSync(
      join(projectRoot, 'apps', 'admin', '.env.example'),
      'utf-8',
    );
    expect(example).toContain(`${varName}=`);
  },
);
```

For Vercel env vars, the parity check has to query Vercel's API (out-of-band of the
test runner), so it's typically a separate `pnpm verify-vercel-env` script run in CI.

## Limitations

This test catches the schema → deploy.yml direction. It does NOT catch:
- A var passed to deploy.yml that the schema doesn't require (harmless but messy)
- A var documented in the runbook but not in the schema (need a separate doc-parity test)
- A GitHub Secret that doesn't exist (cannot be tested from within a workflow run; see
  [secret-existence-vs-exposure.md](secret-existence-vs-exposure.md) for the pre-deploy
  shell guard)

For a fuller-coverage approach, generate the env spec from a single source of truth and
write tests against generated outputs. But the simple parity test above catches 90% of
real drift at near-zero cost.

## Templates

- [env-deploy-parity.spec.template.ts](../../../templates/env-deploy-parity.spec.template.ts)
