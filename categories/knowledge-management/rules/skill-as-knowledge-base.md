---
title: Treat the Skill as a Knowledge Base, Not a Documentation Dump
type: process
maturity: verified
impact: HIGH
impact-description: |
  A skill without 5-layer separation, type taxonomy, maturity lifecycle, and decay
  mechanism becomes a write-only graveyard. The article "Harness isn't the goal,
  knowledge is the moat" (2026-05) describes the failure mode: teams build elaborate
  16-stage workflows, then load the same stale knowledge each run, repeating the same
  mistakes. The fix is treating knowledge as a first-class engineering artifact.
tags: meta, knowledge-management, skill-design, lifecycle
applies-to: |
  Anytime you're maintaining engineering-craft itself — adding rules, retiring rules,
  reorganizing categories, deciding what graduates from project docs to skill rules.
related-rules: []
historical-incidents:
  - PDF-2026-05 ("Harness isn't the goal, knowledge is the moat") — formalized today's PR#85 retro thesis
last-referenced: 2026-05-12
---

## Why this matters

We built engineering-craft today (renamed from production-defensive-patterns) as a
response to PR#85's 5-round review loop. The article confirms our approach AND surfaces
several mechanisms we hadn't built yet:

| Mechanism | Why we need it |
|-----------|----------------|
| 5-layer separation | Right now Layer 1 (this skill) and Layer 2 (LuxeBook business rules) are mixed in project CLAUDE.md. Future projects can't cleanly inherit Layer 1. |
| Maturity lifecycle | Without `draft → verified → proven`, every rule looks equally trustworthy. New rules from one incident shouldn't gate-block reviews like rules backed by 5 incidents. |
| Auto-decay | Without decay, a rule from 2 years ago about a deprecated framework keeps loading and confusing agents. |
| Reference tracking | Without `last-referenced`, we can't tell which rules are dead weight. Decay can't fire. |
| 3-level progressive index | Without `INDEX.md → category README → rule`, every review loads everything. 10x context cost. |
| Stable IDs | Without IDs, citations break on rename. The journal hook can't link consolidated entries to the rules they refined. |

## The discipline

When you maintain the skill, follow this checklist:

### When ADDING a rule

1. **Decide the layer** (see knowledge-management/README.md): cross-project tech? → here. Project-specific? → docs/. Personal? → ~/.claude/CLAUDE.md.
2. **Pick one MECE type**: model / decision / guideline / pitfall / process. Forces clarity on what this rule actually is.
3. **Cite ≥1 historical incident SHA** in frontmatter. No incident = no rule. Ideas without evidence belong in a TODO, not the skill.
4. **Initial maturity = draft** unless backed by ≥2 incidents. Let it earn promotion.
5. **Update INDEX.md statistics + category README rule list** in the same commit.

### When RETIRING a rule

1. **Move file to `categories/_archived/`** with a date-stamped subfolder.
2. **Remove from category README rule table**.
3. **Update INDEX.md statistics**.
4. **Note the reason in the archive folder's README**: stale, contradicted by newer rule, framework deprecated, etc.

### When PROMOTING a Layer 3 doc to Layer 1 rule

1. **Confirm cross-project applicability**: would this rule have helped on a DIFFERENT project? If only LuxeBook, keep at Layer 2.
2. **Write the rule** in engineering-craft format (frontmatter + body).
3. **Cite the originating Layer 3 doc** as the first historical incident.
4. **Initial maturity = verified** (one application — the originating project).
5. **Leave the Layer 3 doc in place** for project-specific context; the new Layer 1 rule supersedes it for general usage.

### When CONSOLIDATING (every 2 days)

`/dev-pipeline:consolidate-lessons` should:
1. Read journal at `~/.claude/lessons-journal/codex-fixes.jsonl`.
2. For each entry, decide: new rule (draft), refines existing rule (bump maturity by one if possible), or duplicate (drop with note).
3. For every rule that was referenced in any session since last consolidation: update `last-referenced` field.
4. For every rule whose `last-referenced` exceeds the decay threshold: demote one level.
5. Push to public mirror at `github.com/orocsy/engineering-craft`.

## Tests / verification

There's no automated test for this rule (it's process-level). The verification is:
- After each consolidation, the diff in the public mirror commit should show maturity field changes (proven counts ↑ over time).
- INDEX.md statistics should match actual category contents (Lint check planned).
- `last-referenced` fields should not all be the consolidation date (would mean nothing got referenced).

## Anti-patterns

- "I'll add this insight as a comment in the code" — comments rot, scope is narrow, no cross-project sharing
- "Project README has it covered" — Layer 3, doesn't propagate
- "I'll add it to CLAUDE.md" — Layer 0-P or 0-T; doesn't decay; pollutes context every session
- "It's a one-off, not worth a rule" — wait for 2nd occurrence; if it recurs, the consolidation will surface it
- "I'll write the rule when I have time" — capture at the moment of insight or it's lost

## References

- Source article: "Harness不是目的，知识才是护城河" (Harness isn't the goal, knowledge is the moat), stevenpxiao, 2026-05
- Karpathy LLM Wiki concept (Ingest + Query + Lint pattern)
- This skill's [INDEX.md](../../../INDEX.md) and [SKILL.md](../../../SKILL.md)
