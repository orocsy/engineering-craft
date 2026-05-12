# Knowledge Management (meta)

**When this category bites**: when you're maintaining the skill itself — adding new rules,
deciding where they live, knowing when to retire them, designing for query efficiency.

**Source**: distilled from a 2026-05 article ("Harness isn't the goal, knowledge is the
moat") by an AI engineering delivery team that built a 16-stage harness with knowledge as
the primary artifact, not the workflow. Their key lesson matches what we observed in
PR#85: workflow harnesses are replaceable, knowledge is permanent.

## The bedrock thesis

> Workflow (harness like dev-pipeline) is just a pipe. Knowledge is the water flowing
> through it. Skills, agents, and toolchains will iterate with models — but
> domain knowledge is permanent.

Every rule we add to engineering-craft is a knowledge entry. The categories, the maturity
levels, the auto-decay, the 3-level index — all exist to keep that knowledge organized,
fresh, and queryable.

## Rules in this category

| Rule | Impact | Trigger |
|------|--------|---------|
| [skill-as-knowledge-base](rules/skill-as-knowledge-base.md) | HIGH | Anytime you're tempted to add a new rule, retire one, or reorganize |

## The 5-layer storage model (where rules live)

| Layer | Path | Scope | Lifecycle |
|-------|------|-------|-----------|
| **0-P** Personal | `~/.claude/CLAUDE.md` (Agent Directives) | Per-user preferences | Stable; rare changes |
| **0-T** Team | `team-conventions/` (future, when team grows) | Team coding/commit style | Quarterly review |
| **1** Tech | `~/.claude/skills/engineering-craft/categories/{concurrency-cas,enumeration-safety,...}/` | Cross-project tech patterns | Auto-decay (proven 12mo, verified 6mo) |
| **2** Business | `apps/api/AGENTS.md` + project CLAUDE.md (LuxeBook tenant rules, booking locks) | Project-specific business rules | Quarterly review |
| **3** Project | `docs/<feature>/*.md` (e.g., docs/owner-password-reset/) | Feature-only context | Archive when feature retires |

**Promotion rule**: a Layer 3 entry that gets cited by 2+ different features → propose
promotion to Layer 1 in the next consolidation. The current rule "race-test-contract"
was originally in PR#85's docs as a project-specific lesson; promoted to Layer 1
because it generalized.

## The 5-type MECE taxonomy (what each rule describes)

Every rule has a single `type` in frontmatter:

| Type | Definition | Example |
|------|-----------|---------|
| `model` | Entity definition, data structure, relationship diagram | "OTP key in Redis = `{codeHash, attempts, issuedAt}`" |
| `decision` | Tech selection, architecture decision + rationale | "Lua over WATCH/MULTI/EXEC because more compact + testable" |
| `guideline` | Recommend (do this) or avoid (don't do this) | recommend: "use `findMany` + fail-closed on length !== 1" |
| `pitfall` | Known risk, failure mode, debug steps | "SET XX only protects key existence, not value match" |
| `process` | Business or operational process / state machine | "Owner password reset: forgot → email/OTP → consume → applyPasswordReset" |

When you write a new rule, pick exactly one type. If you can't decide between two, split
into two rules.

## The 3-maturity lifecycle (how trustworthy is each rule)

| Maturity | Promotion criteria | Demotion criteria |
|----------|-------------------|-------------------|
| **draft** | New rule, observed in 1 incident | Persistent unreferenced + Lint flag → archived |
| **verified** | 1 successful application after the originating incident | 6 months unreferenced → demoted to draft |
| **proven** | ≥2 verifications across ≥2 contexts (different features, different incidents, or different projects) | 12 months unreferenced → demoted to verified |

Promotion happens at `/dev-pipeline:consolidate-lessons` time when journal entries match
existing rules. Demotion happens at the same time based on `last-referenced` field.

## Auto-decay timing

| Current maturity | Stale threshold | Decay action |
|------------------|----------------|--------------|
| proven | 12 months unreferenced | → verified |
| verified | 6 months unreferenced | → draft |
| draft | persistent + Lint flag | → archived (moved to `categories/_archived/`) |

Why decay? Knowledge ages. A 3-year-old "best practice" may be wrong because the
framework upgraded. Better to let stale knowledge fall out of the active index than
let it mislead future agents.

## The 3-level progressive index

Goal: load only what's needed. Three layers:

| Layer | File | Size | Purpose |
|-------|------|------|---------|
| **A** Catalog | [INDEX.md](../../INDEX.md) | ~80 lines | "What's in the knowledge base?" |
| **B** Category | `categories/{class}/README.md` | ~80-150 lines each | "What rules in this category?" |
| **C** Entry | `categories/{class}/rules/{rule}.md` | ~200-400 lines each | "What does this rule say?" |

Always start at A. Drop to B only after deciding which category. Drop to C only when
the one-liner in B doesn't tell you what you need.

This is borrowed from Andrej Karpathy's LLM Wiki concept (referenced in the source
article).

## Knowledge reference tracking (the closed loop)

Goal: know which rules are dead weight (no agent has cited them in months) so we can decay them.

### What to record

When `/dev-pipeline:review` STEP 1.5 loads a category, the agent should drop a
JSON sidecar at the end of the run:

```json
{
  "knowledgeReferences": [
    { "id": "concurrency-cas/state-machine-first", "usedIn": "STEP 2 review prompt" },
    { "id": "enumeration-safety/timing-oracle", "usedIn": "STEP 2 review prompt" },
    { "id": "config-drift/four-consumer-rule", "usedIn": "STEP 5 env audit" }
  ]
}
```

Save to `.claude/knowledge-refs-{sha}.json` per review run.

### Rule ID format + path resolution

Rule IDs in sidecars use the form `<category>/<rule-slug>`, e.g.
`concurrency-cas/state-machine-first`. The resolver expands to:
```
~/.claude/skills/engineering-craft/categories/<category>/rules/<rule-slug>.md
```
The `/rules/` segment is implicit — sidecar IDs don't include it. This keeps
IDs short and human-readable while the actual file layout puts rules in
`rules/` subdirectories.

Reference implementation in `scripts/lint.py` and the consolidation spec.

### What `/dev-pipeline:consolidate-lessons` does with it

Aggregates `knowledgeReferences` across all sessions in the consolidation window.
For each rule:
- If referenced ≥1 time → bump `last-referenced` field in frontmatter
- If unreferenced past the threshold → apply decay

Today this is **partially implemented** — the consolidate-lessons command spec mentions
maturity but doesn't yet compute decay. Lint follow-up planned.

## INIT/ARCHIVE pattern (knowledge enters and exits the workflow)

Inspired by the source article's 16-stage state machine:

### INIT (workflow start)
- `/dev-pipeline:pipeline` should auto-run `git -C ~/.claude/external-mirrors/engineering-craft pull` to ensure local skill matches the public mirror's latest. Currently NOT wired — manual today. Planned.

### ARCHIVE (workflow end)
- After each successful PR merge, the post-codex-fix-extract-lesson hook journals new entries to `~/.claude/lessons-journal/codex-fixes.jsonl`. **This works today.**
- `/dev-pipeline:consolidate-lessons` reads journal, fetches diffs, refines rules, archives entries. **This works today.**
- Auto-promotion (Layer 3 doc → Layer 1 rule) is **manual today** — I have to make the call when consolidating.

## Lint mechanism (knowledge bloat control)

Periodic checks (planned for next consolidation cron):

| Check | Action |
|-------|--------|
| Index inconsistency (rule in folder but not in INDEX/category README) | Auto-fix |
| Orphan entry (no references, no `historical-incidents`) | Demote to draft |
| Contradiction (two rules saying opposite) | Flag conflict; require maintainer resolution |
| Stale (≥6 months no reference for verified, ≥12 for proven) | Apply decay |
| Duplicate / similar (overlapping content) | Flag merge candidates |

## Stable knowledge IDs (planned, not implemented)

The article uses TK-PAT-001 (tech wiki pattern), TK-AP-001 (anti-pattern), BK-AD-E001 (biz
ad entity), BK-AD-P001 (biz ad pitfall). Stable IDs let you cite rules across
consolidations even when files are moved/renamed.

We currently cite by file path + line. That breaks when rules move. Migration to stable
IDs is a follow-up — when we do, the schema will be:

```
EC-{layer}-{category}-{type}-{NNN}
EC-1-CAS-PATTERN-001  → categories/concurrency-cas/rules/state-machine-first.md
EC-1-ENUM-PITFALL-001 → categories/enumeration-safety/rules/timing-oracle.md
EC-2-LB-MODEL-001     → (Layer 2; not in this skill)
```

## Anti-patterns

- "I'll just dump every learning into one big file" — context bloat; load 30K tokens to consult 1 rule
- "Old rules are fine to leave forever" — they rot and mislead
- "Every learning deserves a rule" — most don't; wait for 2nd occurrence before crystallizing
- "Tag with multiple types" — breaks MECE; future queries get noisy
- "I'll write the rule later" — never happens; capture at the moment of insight or it's lost

## How to add a new rule

1. **Decide the layer**: project-specific? → docs/. Cross-project? → engineering-craft.
2. **Pick exactly one type**: model/decision/guideline/pitfall/process.
3. **Decide the category**: matches an existing one? Add there. Doesn't match? Discuss
   creating a new category before forcing.
4. **Initial maturity = draft** unless backed by ≥2 historical incidents.
5. **Required frontmatter fields** (see template below).
6. **Update the category README + the top-level INDEX.md** statistics.

### Frontmatter template (post-PDF-digest standard)

```markdown
---
title: <Imperative title — what to do or not do>
type: <model|decision|guideline|pitfall|process>
maturity: <draft|verified|proven>
impact: <CRITICAL|HIGH|MEDIUM|LOW>
impact-description: |
  <2-3 sentences on what breaks without this rule>
tags: <comma-separated, used in catalog filters>
applies-to: |
  <Specific situations where this rule fires>
related-rules:
  - <other rule files>
historical-incidents:
  - <SHA or PR#: one-line description>
last-referenced: <ISO date — auto-updated by consolidation>
---
```
