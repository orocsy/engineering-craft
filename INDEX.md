# engineering-craft — Layer A Catalog

> The fastest entry point. Read this BEFORE diving into any category README.
> ~80 lines covers the entire knowledge base. Then go to a category README
> for one-line summaries. Then read a rule file only if you need full content.
> Borrowed from Karpathy's LLM Wiki 3-level progressive index.

## Statistics

| Group | Categories | Rules | Templates | Checklists |
|-------|-----------|-------|-----------|------------|
| Defensive patterns | 5 | 19 | 7 | 4 |
| Process & habits | 4 | 8 | 0 | 0 |
| Knowledge management (meta) | 1 | 1 | 0 | 0 |
| **Total** | **10** | **28** | **7** | **4** |

## By-phase recommendations (which categories to load when)

| Pipeline phase | Mandatory categories | Optional categories |
|---------------|---------------------|---------------------|
| **G1 — Requirements** | (none) | workflow (pull-main-before-branching) |
| **G2 — Design** | concurrency-cas (state-machine-first) | enumeration-safety (if "do not leak" endpoint) |
| **G3 — Architecture** | concurrency-cas (sibling-resource-invariants) | silent-no-op-integrations (if 3rd-party API), library-choice (libs-first) |
| **G4 — Implementation** | concurrency-cas (storage-gate-not-js, race-test-contract), config-drift (four-consumer-rule) | tooling-footguns (if running gh CLI), library-choice |
| **Pre-push self-review** | **ALL relevant by diff keywords** (see SKILL.md trigger table) + workflow (self-review-before-push) | grep-for-siblings (if security literal removed) |
| **Post-merge** | process (post-merge-deploy-verification) | workflow (push-back-on-reviews-when-verified, when reviewer flags) |

## By-trigger recommendations (which categories to load when keywords appear)

| Trigger keyword in diff or task | Load category first |
|--------------------------------|---------------------|
| `forgot-password`, `reset-password`, `otp`, `jwt`, `session`, `tokenVersion` | concurrency-cas + enumeration-safety + auth-otp checklist |
| `findFirst`, `email` lookup, multi-tenant | enumeration-safety/multi-tenant-fail-closed |
| `env.schema`, `deploy.yml`, `secrets.X`, `gh secret set` | config-drift + tooling-footguns |
| `Resend`, `Twilio`, `Stripe`, `S3`, `OAuth` (any third-party API) | silent-no-op-integrations |
| `dev-secret-change-in-production` removal, security literal change | grep-for-siblings/security-literal-grep |
| `regex`, `parseISO`, `new RegExp`, hand-rolled parser | library-choice/libs-first-no-reinventing |
| `git checkout -b`, branch creation | workflow/pull-main-before-branching |
| Pre-push git operations | workflow/self-review-before-push |
| Codex / PR-bot finding response | workflow/push-back-on-reviews-when-verified |
| `gh workflow run`, post-merge | process/post-merge-deploy-verification |

## Categories at a glance

### Defensive patterns

| Category | One-line | Most-cited rule |
|----------|----------|----------------|
| concurrency-cas | Read-Modify-Write across network is never atomic; gate must be in storage primitive | storage-gate-not-js |
| enumeration-safety | Two responses on a sensitive condition must be indistinguishable on every observable channel | timing-oracle |
| config-drift | Every env var has 4+ consumers (schema, deploy.yml, .env.example, docs); same-commit rule | four-consumer-rule |
| silent-no-op-integrations | Third-party wrapper that silently no-ops on missing API key is the worst failure mode | configured-state-visible |
| grep-for-siblings | Security-relevant literal removal triggers repo-wide grep | security-literal-grep |

### Process & habits

| Category | One-line | Most-cited rule |
|----------|----------|----------------|
| workflow | Branch from latest main; self-review with code-reviewer agent before push; push back on reviews after evidence | self-review-before-push |
| tooling-footguns | CLI behavior may differ from docs (gh secret set --body - sets the literal "-") | gh-secret-set-stdin |
| library-choice | Don't hand-roll regex/parser/date/URL — battle-tested libs handle every edge case | libs-first-no-reinventing |
| process | "Tests pass" ≠ "deploy succeeded"; watch deploy after every merge | post-merge-deploy-verification |

### Meta

| Category | One-line |
|----------|----------|
| knowledge-management | How the skill itself is structured, matured, decayed, and lint'd. Read once, apply forever. |

## Maturity legend

Each rule's frontmatter declares one of:
- **proven** — backed by ≥2 historical incidents across ≥2 projects (or 2+ PR rounds in same project). High confidence; load eagerly when triggered.
- **verified** — backed by 1 historical incident, validated by ≥1 successful application since. Load when triggered.
- **draft** — observed once, no validation yet. Load only when explicit signal matches; expect refinement as more incidents arrive.

## Decay legend

Decay applies when a rule isn't referenced in `knowledgeReferences` for the timeout period:

| Current maturity | Decay trigger | New maturity |
|------------------|---------------|--------------|
| proven | 12 months unreferenced | verified |
| verified | 6 months unreferenced | draft |
| draft | persistent unreferenced + Lint flag | archived (moved out of active index) |

Run `/dev-pipeline:consolidate-lessons` (every 2 days via launchd reminder) to apply decay.

## How to read this skill

1. **Always start here** (`INDEX.md`) — figure out which category matches your work.
2. **Read the category `README.md`** — get one-line summaries of every rule.
3. **Read individual rule files only when** the one-liner doesn't tell you what you need.

This 3-level progression is the difference between "load 28 rules into context (~30K tokens)" and "load 1 INDEX + 1 category README + 1-2 rule files (~3K tokens)" — 10x context efficiency.
