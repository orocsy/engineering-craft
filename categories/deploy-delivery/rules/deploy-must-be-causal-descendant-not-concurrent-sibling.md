---
title: A Deploy Triggered By the Same Event as CI Is Correlated With Green, Not Caused By It
last-referenced: 2026-08-06
maturity: proven
type: guideline
impact: CRITICAL
impact-description: |
  Two workflows on `on: push` start together. The deploy neither waits for the test
  workflow nor reads its verdict, so a red suite ships — and frequently finishes shipping
  before the suite has even finished running. Both files look correct in isolation; only
  the JOIN between them is wrong, and no file contains the join.
tags: ci, cd, github-actions, deploy, gating, workflow_run, causality
applies-to: |
  Every job that mutates a shared target — deploy, migrate against a real database,
  publish a package, push an image tag, invalidate a CDN, write a production secret.
related-rules:
  - workflow-chain-coverage-and-gotchas
  - deploy-cancel-in-progress-false
  - post-merge-deploy-verification
  - skip-is-a-decision-not-a-default
historical-incidents:
  - a real repo: `ci.yml` (lint, typecheck, unit tests, SDK contract probe) and
    `deploy-test.yml` both on `on: push`. The deploy job re-ran lint/typecheck/build itself
    but never the test suite or the contract probe, and declared no `needs:`/`workflow_run`
  - a second repo: the deploy chained via `workflow_run` to a workflow whose only step was
    an `echo` — its NAME contained "Test", so it read like a gate
  - a third repo: the deploy chained to the container-image build rather than to the
    workflow that runs the tests
---

## The shape

```yaml
# ci.yml
on: { push: { branches: [test] } }
jobs:
  checks:
    steps: [ …, { run: pnpm test }, { run: pnpm verify:sdk-contract } ]

# deploy-test.yml        ← a SIBLING, not a descendant
on: { push: { branches: [test] } }
jobs:
  deploy:
    environment: test
    steps: [ …, { run: pnpm deploy:cloudbase:test } ]     # ❌ never observes ci.yml
```

Both files pass review. The deploy even re-runs lint, typecheck and build, which makes it
*look* self-verifying — while omitting the two steps that actually catch regressions. The
missing thing is not a step; it is an **edge in the graph**, and no file is responsible for
edges.

## Correct — one of these three, explicitly

```yaml
# ✅ 1. Same workflow, `needs:` chain. Simplest and most legible.
jobs:
  validate: { steps: [{ run: pnpm test }] }
  deploy:   { needs: validate, environment: test, steps: [{ run: pnpm deploy }] }

# ✅ 2. Cross-workflow, workflow_run + an EXPLICIT success guard.
on:
  workflow_run: { workflows: [CI], types: [completed] }
jobs:
  deploy:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}   # ← without this, a FAILED CI still fires
    …

# ✅ 3. The deploy job runs the proof itself, in-job, before the deploy step.
```

Two traps inside the correct forms:

- **`workflow_run` without the conclusion guard.** The event fires on `completed`, which
  includes `failure` and `cancelled`. The trigger alone gates nothing.
- **`workflow_run` pointed at the wrong workflow.** Chaining to the image build, or to a
  marker workflow whose name merely contains "Test", produces a graph that is causal and
  still proves nothing. Verify what the upstream workflow *runs*, not what it is called.

## Verify by trigger, not by file

The question is never "does this repo run tests?" — it is **"on the trigger that actually
ships, which verification steps execute?"** Enumerate per trigger. A smoke wired to
`workflow_dispatch` with a boolean input does not run on `push`, so the shipping path has
no smoke coverage while the run shows a green tick beside a step that never executed.

## Executable gate

[`pipeline-causality.template.mjs`](../../../templates/pipeline-causality.template.mjs) — for
every job that runs a deploy-shaped command, asserts it either runs the proof steps in-job,
or reaches a job that does through the transitive `needs:` closure, or is triggered by
`workflow_run` on a workflow that genuinely runs them AND carries a success guard.

Two details that decide whether this gate survives contact with a real repo:

- **Match proof commands as whole commands.** The first draft used
  `run.includes('pnpm test')`, which was satisfied by `pnpm test:e2e:public` — the gate
  passed a repo whose defect it was written to find. (See
  [probe-must-fail-on-injected-defect](../../verification-integrity/rules/probe-must-fail-on-injected-defect.md).)
- **Walk `needs:` transitively, and exclude deploy-word false friends** such as
  `prisma migrate deploy` against an ephemeral service container. A direct-`needs:`-only
  check reported three false positives on a correctly-chained seven-job pipeline, and a
  gate that cries wolf gets switched off — which is how a repo ends up with no gate at all.

## See also

- [workflow-chain-coverage-and-gotchas](workflow-chain-coverage-and-gotchas.md)
- [post-merge-deploy-verification](../../process/rules/post-merge-deploy-verification.md)
