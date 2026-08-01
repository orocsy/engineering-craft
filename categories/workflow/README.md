# Workflow

**When this category bites**: branched from stale main, skipped self-review,
accepted false-positive automated-review feedback without verification, used
the wrong branch naming convention, or handed off a hosted preview without
saying where the user-owned source repository actually lives.

**Source incidents**: a review cycle where self-review caught what the automated
reviewer missed; a false-positive Stripe cancel cascade flagged by the automated
reviewer; a branch-naming directive; a production domain cutover squash-merge
surprise; and a generated site whose local repo, hosting-managed source and
public runtime were three different provenance layers.

## Rules in this category

| Rule | Impact | Trigger |
|------|--------|---------|
| [pull-main-before-branching](rules/pull-main-before-branching.md) | HIGH | Starting any new branch |
| [branch-naming-convention](rules/branch-naming-convention.md) | MEDIUM | First push of a new branch |
| [self-review-before-push](rules/self-review-before-push.md) | CRITICAL | Before every git push |
| [push-back-on-reviews-when-verified](rules/push-back-on-reviews-when-verified.md) | HIGH | Automated-reviewer / PR-bot finding that looks wrong after investigation |
| [source-provenance-before-handoff](rules/source-provenance-before-handoff.md) | HIGH | Generated/hosted preview handoff; user asks where source code or repository lives |

## Anti-patterns

- "I'll branch from local main; pull's a habit" — squash-merge invalidates local-history assumptions
- "I'll let the post-merge reviewer find the bugs" — it's a second opinion, not primary; loop is expensive
- "I'll auto-fix every automated-review finding to be safe" — false positives accumulate as code rot
- "claude/foo branch name is fine" — never; use feat/fix/chore/docs prefix
- "The preview works, so the source must be in the user's GitHub" — verify local remote, hosting source and deployed artifact separately

## Historical incidents

| Event | One-line | Rule that would have prevented it |
|------------|----------|----------------------------------|
| A domain cutover | Branched from stale main; squash merge had broken local assumptions | pull-main-before-branching |
| A review cycle | The automated reviewer flagged a Stripe cancel cascade, was a false positive; would have wasted hours auto-fixing | push-back-on-reviews-when-verified |
| Same review cycle, self-review | Self-review caught A→B→A race that the automated reviewer missed | self-review-before-push |
| A naming directive | Auto-spawned `claude/<name>` worktree branches need rename to `feat/<name>` BEFORE first push | branch-naming-convention |
| A generated-site handoff | Public runtime and private hosting source existed, but the local Git repo had no user-owned remote | source-provenance-before-handoff |
