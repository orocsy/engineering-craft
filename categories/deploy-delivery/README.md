# Deploy & Delivery (CI/CD chains, image transport, deploy-time secrets, gates)

**When this category bites**: the code is fine — the *delivery* of it breaks production.
A deploy recreates a database container it doesn't own; a registry PAT expires; a
green-on-box deploy is publicly dark; a secret file gets overwritten with nothing;
a canceled workflow leaves a half-restarted container serving traffic.

**Source projects**: LuxeBook (first GHCR→SSH→compose topology, 2026-05) and
CoachFlow (push-on-main chain armed 2026-08-01 — first fully automated
merge→build→deploy, with the first-run failure and its fix shipped through the
pipeline itself the same hour).

## The bedrock rule

**A deploy pipeline is production code with production blast radius — review it
against the box's ACTUAL running state (not the committed ideal), gate every
irreversible step, and make every failure loud and every success verified.**

## Rules

| Rule | One-line | Risk |
|---|---|---|
| [deploy-must-be-causal-descendant-not-concurrent-sibling](rules/deploy-must-be-causal-descendant-not-concurrent-sibling.md) | A deploy on the same trigger as CI is CORRELATED with green, not caused by it — chain via `needs:` or `workflow_run` + a success guard | P0 |
| [runner-brokered-artifact-transport](rules/runner-brokered-artifact-transport.md) | Before minting any long-lived machine credential, let the CI runner's per-run token broker the artifact | P1 |
| [deploy-touches-only-owned-services](rules/deploy-touches-only-owned-services.md) | Compose recreates ANY service whose config hash differs — scope deploys to the service you own | P0 |
| [env-write-guard](rules/env-write-guard.md) | An env-delivery step must never replace real secrets with nothing | P0 |
| [deploy-cancel-in-progress-false](rules/deploy-cancel-in-progress-false.md) | Deploy concurrency groups never cancel in-progress — a half-deploy is undefined state | P1 |
| [public-gate-after-on-box-gate](rules/public-gate-after-on-box-gate.md) | Healthy on the box ≠ reachable by users — gate both | P1 |
| [secrets-into-ci-from-files-only](rules/secrets-into-ci-from-files-only.md) | `gh secret set` from file/stdin only; know the agent-session credential boundary | P1 |
| [image-must-not-contain-env](rules/image-must-not-contain-env.md) | `.dockerignore` needs `**/.env` — nested env files ride into images | P0 |
| [workflow-chain-coverage-and-gotchas](rules/workflow-chain-coverage-and-gotchas.md) | workflow_run chains: five sharp edges incl. the paths-filter coverage gap | P1 |
| [build-artifact-perms-cross-uid](rules/build-artifact-perms-cross-uid.md) | `docker save -o` writes 0600; the next step's container uid can't read it | P2 |
| [explicit-prune-for-tagged-images](rules/explicit-prune-for-tagged-images.md) | sha-tagged images never dangle — prune by name, keep the deployed tag | P2 |
| [pinned-cli-in-containers](rules/pinned-cli-in-containers.md) | `npx --no-install` from the workdir that resolves the pinned CLI — or you run LATEST | P1 |
| [first-run-discipline](rules/first-run-discipline.md) | Name never-executed assumptions as watch-items; fix the pipeline through the pipeline | P2 |

## Cross-links

- `config-drift` owns the deeper env-var 4-consumer rule; this category owns the
  DELIVERY of env to hosts.
- `process/post-merge-deploy-verification` is the human-side habit; the gates here
  are its automation.
- Payment-domain deploy specifics (webhook endpoints per hostname, key contexts)
  live in the payment-engineering repo (two-layer architecture).

*Last updated: 2026-08-01 (category created — CoachFlow chain-arming session).*
