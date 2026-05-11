---
title: Every Security-Relevant Literal Removal Triggers a Repo-Wide Grep
impact: CRITICAL
impact-description: |
  PR#85 round 5: removed `'dev-secret-change-in-production'` from one file. Three other
  files had the same fallback. Codex didn't catch round 5 — Claude Code's background
  scan did. If I were just a model in chat, I would have shipped the inconsistent state.
tags: security, grep, literal, refactor, secret
applies-to: |
  Removing or changing any literal that has security implications: hardcoded secret
  fallbacks, hardcoded URLs (CORS, OAuth callbacks), hardcoded tenant IDs, hardcoded
  user IDs, default API keys, etc.
related-rules:
  - api-rename-cross-cut-grep
historical-incidents:
  - PR#85 round 5
---

## The pattern

You see this:

```typescript
// auth.service.ts
const secret = process.env.OTP_HASH_SECRET || 'dev-secret-change-in-production';  // ← REMOVE
```

You change it to:

```typescript
const secret = process.env.OTP_HASH_SECRET;
if (!secret) throw new Error('OTP_HASH_SECRET required');
```

Done? **No.** Before you commit, run the grep:

```bash
grep -rn "dev-secret-change-in-production\|luxebook-booking-manage-token-dev\|luxebook-local-contact-hash-secret" \
  apps/ --include="*.ts" --include="*.js"
```

PR#85 round 5 turned up matches in:
- `auth.module.ts` — passes the same fallback to JWT module
- `jwt.strategy.ts` — uses the same fallback for token verification
- `booking.service.ts` — different literal but same pattern

Each of those is the same vulnerability. Fix them all in the same PR.

## The discipline

Whenever you write a commit that removes or replaces a security-relevant literal:

1. **Identify the family of related literals.** It's rarely just one string. Group by:
   - The same hardcoded fallback pattern (`'dev-...'`, `'change-in-production'`,
     `'TODO-set-real-value'`)
   - The same env var with `||` fallback
   - The same default in `process.env.X || 'default'`

2. **Grep for each member of the family.**

3. **For each match: classify (true sibling vs. false positive) and fix the true
   siblings in the same PR.**

4. **Add a CI test if possible** — if the literal can be detected by static scan
   (regex), add a guard that fails build when it reappears:

```typescript
// apps/api/src/__tests__/no-dev-secrets.spec.ts
import { execSync } from 'child_process';

it('no dev-secret literals remain in src', () => {
  let result = '';
  try {
    result = execSync(
      `grep -rn "dev-secret-change-in-production\\|luxebook-local-contact-hash-secret" apps/api/src/ || true`,
      { encoding: 'utf-8' },
    );
  } catch (e: any) {
    result = e.stdout?.toString() || '';
  }
  expect(result).toBe('');
});
```

## Common literal families to grep for

| Family | Grep pattern | Why |
|--------|--------------|-----|
| Dev secret fallbacks | `dev-.*\|change-in-production\|TODO\|placeholder\|local-` | Hardcoded fallbacks defeat env-required checks |
| Hardcoded URLs | `localhost:\|127\.0\.0\.1\|http://`  | Should be from env / config |
| Hardcoded tenant IDs | `tenant-1\|tenant-test\|seed-tenant` | Test fixtures should not leak into prod paths |
| Hardcoded user IDs | `user-1\|test-user\|admin-` | Same |
| Default API keys | `re_test\|sk_test\|pk_test` | Should be env-driven |
| Magic numbers | `1234567\|123456\|password123` | OTP, password test values |

## Pre-commit guard

Add a pre-commit hook stanza that warns on these patterns being introduced:

```bash
# .git/hooks/pre-commit (or via husky)
if git diff --cached --diff-filter=A -- 'apps/api/src/*.ts' | grep -E "dev-(secret|jwt|hash)|change-in-production|TODO-set-real"; then
  echo "WARN: introducing a dev-secret literal — confirm intent (export ALLOW_DEV_SECRET=1 to bypass)"
  if [ "$ALLOW_DEV_SECRET" != "1" ]; then
    exit 1
  fi
fi
```

This catches future regressions even if the security-literal test above doesn't run on
every commit.

## Related: removing a fallback also requires the env to be set

If you remove `process.env.X || 'default'`, the env var becomes truly required. Couple
this with [four-consumer-rule.md](../../config-drift/rules/four-consumer-rule.md):

- Add to `env.schema.ts` superRefine
- Add to deploy.yml `-e VAR=...`
- Verify GitHub Secret exists
- Update runbook

The grep finds the literal sites; the four-consumer rule wires the new requirement
through every config consumer.

## Anti-patterns

- "I'll add the test guard later" — deferred guards mean the literal returns
- "It's only one literal, the others are slightly different" — they're the same
  vulnerability class; check each individually
- "We have a lint rule for this" — most lint rules don't catch string literals; verify
  with grep first
