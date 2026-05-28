---
title: Watch the Deploy After Every Merge — "Tests Passed" Is Not "Deploy Succeeded"
last-referenced: 2026-05-12
maturity: verified
type: process
impact: HIGH
impact-description: |
  A real PR was merged. Tests passed. Deploy crashed in production with
  CUSTOMER_CONTACT_HASH_SECRET missing because nobody verified the secret existed.
  Hours of production downtime that 30 seconds of `gh run watch` would have prevented.
tags: process, deploy, ci, verification, post-merge
applies-to: |
  Every merge of any PR that auto-deploys. Especially PRs that add new env vars, new
  secrets, new infrastructure, or new third-party integrations.
related-rules:
  - secret-existence-vs-exposure (config-drift)
historical-incidents:
  - A real post-merge deploy crash (required secret missing from GitHub Secrets)
---

## The discipline

After hitting "Merge" on a PR:

```bash
# 1. Tail the deploy run
gh run watch --workflow deploy.yml --interval 15

# 2. After deploy completes, confirm the production health endpoint
curl -fsS https://api.your-domain.com/health || echo "PROD UNHEALTHY"

# 3. Manually exercise the affected feature once
# (e.g., trigger a password reset against prod, watch for 204)
```

If the deploy fails or health is bad:
- Look at deploy logs for env validation errors
- Check `gh secret list` for missing secrets
- Roll back if the previous version was healthy

Don't walk away assuming "tests passed = deploy succeeded." The test env doesn't have:
- Production GitHub Secrets
- Production Zod env-schema (in production mode)
- Production third-party integration credentials
- Production network topology (Cloudflare Tunnel, etc.)

## What the deploy can fail on that tests can't catch

| Failure | Why tests miss it |
|---------|-------------------|
| GitHub Secret missing | Tests use mocked env, not production secrets |
| Zod prod-required field empty | Tests run in `NODE_ENV=test`, prod-required checks don't fire |
| Container runtime mismatch | Test uses dev Docker image; prod uses different layer order |
| Cloudflare Tunnel down | Tests don't go through the tunnel |
| New ENV-required by deploy.yml not yet set in GitHub Secrets | Pre-merge env-deploy parity test catches schema/deploy.yml drift, NOT secret-existence |
| Database migration on prod data | Tests use migrated test DB; prod has real data shapes |
| Resend domain DKIM not propagated | Tests mock Resend |

## Pre-merge gate (the cheap version)

Before merging, verify the production GitHub Secrets exist:

```bash
# What new secrets does this PR reference in deploy.yml?
git diff main..HEAD -- .github/workflows/deploy.yml | grep -oE 'secrets\.[A-Z_]+' | sort -u

# Cross-check against existing secrets
gh secret list -R owner/repo

# Set any missing ones BEFORE merging
```

This is cheaper than post-merge recovery (downtime + revert + redeploy).

## Recovery patterns

If the deploy fails:

1. Check the failed job logs:
   ```bash
   gh run view <run-id> --log-failed | tail -100
   ```

2. Common errors:
   - `ZodError: VAR_NAME: Required in production` → set the GitHub Secret, redeploy
   - `pnpm build` failure → fix code, push, redeploy
   - `docker pull` failure → check GHCR image was pushed by the build job
   - SSH timeout → check EC2 instance is up; investigate

3. If the previous deploy was healthy and the fix isn't immediate:
   ```bash
   # Roll back to the previous SHA
   gh workflow run deploy.yml --ref <previous-good-sha>
   ```

4. After fix, redeploy:
   ```bash
   gh workflow run deploy.yml --ref main
   gh run watch
   ```

## Anti-patterns

- "Tests passed, I'm done" — tests verify code correctness, not deploy correctness
- "The CI badge is green" — CI badge reflects last build, not last deploy
- "I'll check tomorrow" — production might be down for hours
- "Someone else will notice" — your PR, your watch
