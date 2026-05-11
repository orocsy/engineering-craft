# Config Drift (env vars, schemas, deploy workflows, runbooks)

**When this category bites**: an env var is added in one consumer (e.g., `env.schema.ts`)
but missing from another (e.g., `deploy.yml`). The next deploy crashes at boot.

**Source incidents**: PR#85 round 4 (`CUSTOMER_CONTACT_HASH_SECRET` schema-required
without `deploy.yml` pass-through), PR#85 round 4 (`RESEND_FROM_EMAIL` validator rejected
the runbook-documented format), and the **post-merge production deploy failure** —
deploy.yml had the line, but the GitHub Secret itself was never set.

## The bedrock rule

**A configuration value has at least 4 consumers, often more. Changing one without
checking the others = production crash at next deploy.**

The 4 standard consumers in this project:
1. `apps/api/src/config/env.schema.ts` — runtime validation (Zod)
2. `.github/workflows/deploy.yml` — `-e VAR=...` pass-through to docker
3. `apps/api/.env.example` (if exists) — local dev hint
4. Documentation (runbook, README, AGENTS.md, CLAUDE.md)

For some vars, additional consumers:
5. `docker-compose.yml` — local dev container
6. Vercel project env vars (frontend secrets like `NEXT_PUBLIC_*`)
7. Test fixtures (`buildDisabledBillingEnv`, `jest-setup.ts`)
8. **GitHub Secrets** — the value behind `${{ secrets.X }}` MUST exist (this is what
   bit production after PR#85 was merged)

## Rules in this category

| Rule | Impact | Trigger |
|------|--------|---------|
| [four-consumer-rule](rules/four-consumer-rule.md) | CRITICAL | Adding/changing any env var |
| [secret-existence-vs-exposure](rules/secret-existence-vs-exposure.md) | CRITICAL | Adding a `${{ secrets.X }}` line in deploy.yml |
| [validator-runbook-parity](rules/validator-runbook-parity.md) | HIGH | Updating a Zod validator on an env var |
| [env-deploy-parity-test](rules/env-deploy-parity-test.md) | HIGH | The CI-time guard that catches drift before deploy |

## Templates

- [env-deploy-parity.spec.template.ts](../../templates/env-deploy-parity.spec.template.ts)

## Checklists

- [New env var checklist](../../checklists/new-env-var.md)

## Anti-patterns

- "I'll add the schema check now and update deploy.yml later" — deferred consumer updates never happen
- "The runbook is just docs, validator doesn't need to match" — users follow runbook, validator rejects, prod boot fails
- "GitHub Secret already exists, so we're fine" — secret existence ≠ container env exposure (the deploy.yml `-e` line is required)
- "I'll grep for the literal later" — deferred greps never happen

## Historical incidents

| SHA / event | One-line | Rule that would have prevented it |
|------------|----------|----------------------------------|
| PR#85 round 4 | Schema required `CUSTOMER_CONTACT_HASH_SECRET`; deploy.yml didn't pass it through | four-consumer-rule + env-deploy-parity-test |
| PR#85 round 4 | `RESEND_FROM_EMAIL` validator rejected display-name format that the runbook recommended | validator-runbook-parity |
| PR#85 post-merge | Deploy.yml had the secret line but GitHub Secret itself was never set; container crashed at boot | secret-existence-vs-exposure |
