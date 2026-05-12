---
title: Every Env Var Has 4+ Consumers — Update Them All in the Same Commit
last-referenced: 2026-05-12
maturity: proven
type: guideline
impact: CRITICAL
impact-description: |
  Forgetting to update deploy.yml when adding a production-required env var crashes
  the next deploy at boot. PR#85 round 4 caught this for CUSTOMER_CONTACT_HASH_SECRET;
  if Codex had missed it, prod would have been down.
tags: config, env, deploy, schema, drift
applies-to: |
  Any time you add, rename, change validation of, or delete an env var. Same-commit
  rule: all consumers updated in the SAME pull request, ideally the same commit.
related-rules:
  - secret-existence-vs-exposure
  - validator-runbook-parity
  - env-deploy-parity-test
historical-incidents:
  - PR#85 round 4 (CUSTOMER_CONTACT_HASH_SECRET)
---

## The 4 standard consumers

Every env var in this project must be wired through the SAME commit at every consumer:

### 1. `apps/api/src/config/env.schema.ts`

The Zod schema. Runtime validation at boot.

```typescript
// Add the field with appropriate optionality
const envSchema = z.object({
  // ...
  CUSTOMER_CONTACT_HASH_SECRET: z.string().optional(),
  // ...
}).superRefine((data, ctx) => {
  // ...
  if (data.NODE_ENV === 'production' && !data.CUSTOMER_CONTACT_HASH_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CUSTOMER_CONTACT_HASH_SECRET'],
      message:
        'Required in production — keys the HMAC for OTP storage (customer retrieval + ' +
        'owner password reset). Without it, OTP hashes are derivable. Set the GitHub ' +
        'secret CUSTOMER_CONTACT_HASH_SECRET (>=16 chars).',
    });
  }
});
```

The error message is part of the contract — it tells the human at deploy-time exactly
what to do.

### 2. `.github/workflows/deploy.yml`

The `-e VAR=...` pass-through. Without this, `${{ secrets.X }}` never reaches the
container.

```yaml
script: |
  docker run -d \
    --name api \
    # ... \
    -e JWT_SECRET="${{ secrets.JWT_SECRET }}" \
    -e CUSTOMER_CONTACT_HASH_SECRET="${{ secrets.CUSTOMER_CONTACT_HASH_SECRET }}" \
    # ... \
    ghcr.io/orocsy/luxebook-api:latest
```

### 3. `apps/api/.env.example` (if exists)

Local dev hint. Placeholder, never a real value.

```bash
# .env.example
JWT_SECRET=dev-jwt-secret-change-in-production
CUSTOMER_CONTACT_HASH_SECRET=dev-otp-hmac-change-in-production
```

### 4. Documentation

`docs/<feature>/runbook.md`, `README.md`, `AGENTS.md` — wherever the var is referenced.

## Additional consumers (project-specific)

5. `docker-compose.yml` — local dev container.
6. Vercel project env vars + `vercel.json` (for `NEXT_PUBLIC_*`).
7. Test fixtures: `buildValidEnv`, `buildDisabledBillingEnv`, `jest-setup.ts`.
8. **GitHub Secrets** — the secret behind `${{ secrets.X }}` must exist. Verify with
   `gh secret list -R owner/repo | grep X`. See
   [secret-existence-vs-exposure.md](secret-existence-vs-exposure.md).

## Pre-flight checklist

When you ADD or CHANGE an env var:

- [ ] Add/update entry in `env.schema.ts` with correct optionality
- [ ] If production-required: add to `superRefine` block with a descriptive error message
- [ ] Add to `deploy.yml` docker run env list (`-e VAR="${{ secrets.VAR }}"`)
- [ ] If documented in runbook/README: ensure the validator accepts the documented format
- [ ] If shown in `.env.example`: update with the new var (placeholder, no real value)
- [ ] Update test fixtures (`buildDisabledBillingEnv` / `buildValidEnv` / `jest-setup.ts`)
- [ ] If frontend reads it: add to Vercel project env vars + `vercel.json` if applicable
- [ ] Verify the GitHub Secret exists (`gh secret list -R owner/repo | grep VAR`)
- [ ] If renaming: grep for the old name across all of the above and update simultaneously

## What "same commit" means

The first 4 consumers (schema, deploy, .env.example, docs) MUST land in the same commit.
This is enforceable via a CI gate (see [env-deploy-parity-test.md](env-deploy-parity-test.md)).

The GitHub Secret existence check is NOT a code consumer (lives in GitHub UI/admin),
but the deploy will fail at boot if the secret is missing. The pre-flight checklist
above includes the verify step.

## Why same-commit?

Two reasons:
1. **Rollback safety**: if you have to revert, you revert ALL consumers together. No
   half-rolled-back state.
2. **Cognitive load**: if the four updates are spread across 3 PRs, one will be
   forgotten. The empirical rate at LuxeBook is ~30% of split env-var changes have a
   missing consumer.

## Tests

A small CI test that fails if the schema requires a var in production but deploy.yml
doesn't pass it through:

```typescript
// apps/api/src/config/env.schema.spec.ts
import { readFileSync } from 'fs';
import { join } from 'path';

it('every var declared production-required is also passed through deploy.yml', () => {
  const schemaSrc = readFileSync(
    join(__dirname, 'env.schema.ts'),
    'utf-8',
  );
  const deploySrc = readFileSync(
    join(__dirname, '..', '..', '..', '..', '..', '.github', 'workflows', 'deploy.yml'),
    'utf-8',
  );

  // Find every var inside an `if (data.NODE_ENV === 'production' && !data.X)` block
  const requiredVars = [...schemaSrc.matchAll(
    /data\.NODE_ENV === 'production' && !data\.(\w+)\)/g
  )].map(m => m[1]);

  for (const v of requiredVars) {
    expect(deploySrc).toMatch(
      new RegExp(`-e ${v}=.*secrets\\.${v}`)
    );
  }
});
```

This catches the PR#85 round 4 failure mode at validation gate, not at next deploy attempt.

## When to merge a partial change

Never. If you can't update all four consumers in one PR (e.g., docs are in a separate
repo), the change isn't ready. Either:
- Defer the env var addition until you can land all updates atomically
- Add the var as OPTIONAL (not production-required) first, then a follow-up PR makes it
  required after docs/deploy.yml are wired

## Anti-patterns

- "I'll just add the schema check now and update deploy.yml later" — never happens
- "The runbook is in another repo, I'll PR there separately" — separate PR, unmerged at
  deploy time, validator rejects user-followed format → boot fail
- "GitHub Secret already exists" — existence ≠ exposure (next rule)
