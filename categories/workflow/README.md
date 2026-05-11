# Workflow

**When this category bites**: branched from stale main, skipped self-review, accepted false-positive Codex feedback without verification, used the wrong branch naming convention.

**Source incidents**: PR#37 self-review caught what Codex missed; PR#37 false-positive Stripe cancel cascade; PR#87 branch naming directive; getluxebook.com cutover squash-merge surprise.

## Rules in this category

| Rule | Impact | Trigger |
|------|--------|---------|
| [pull-main-before-branching](rules/pull-main-before-branching.md) | HIGH | Starting any new branch |
| [branch-naming-convention](rules/branch-naming-convention.md) | MEDIUM | First push of a new branch |
| [self-review-before-push](rules/self-review-before-push.md) | CRITICAL | Before every git push |
| [push-back-on-reviews-when-verified](rules/push-back-on-reviews-when-verified.md) | HIGH | Codex/PR-bot finding that looks wrong after investigation |

## Anti-patterns

- "I'll branch from local main; pull's a habit" — squash-merge invalidates local-history assumptions
- "I'll let Codex find the bugs" — Codex is second opinion, not primary; loop is expensive
- "I'll auto-fix every Codex finding to be safe" — false positives accumulate as code rot
- "claude/foo branch name is fine" — never; use feat/fix/chore/docs prefix

## Historical incidents

| SHA / event | One-line | Rule that would have prevented it |
|------------|----------|----------------------------------|
| Pre-PR#85 cutover | Branched from stale main; squash merge had broken local assumptions | pull-main-before-branching |
| PR#37 round 1 | Codex flagged Stripe cancel cascade, was a false positive; would have wasted hours auto-fixing | push-back-on-reviews-when-verified |
| PR#37 self-review | Self-review caught A→B→A race that Codex missed | self-review-before-push |
| PR#87 directive | Auto-spawned `claude/<name>` worktree branches need rename to `feat/<name>` BEFORE first push | branch-naming-convention |
