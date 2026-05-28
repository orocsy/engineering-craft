---
title: Run pnpm build (or project equivalent) BEFORE Every Commit
last-referenced: 2026-05-12
maturity: verified
type: process
impact: HIGH
impact-description: |
  A real postmortem: broken git hooks + an incomplete `replace_all` Edit shipped a TS
  error to main. The TS check would have caught it; the broken pre-commit hook
  meant it never ran. Lesson: don't trust hooks; run the validation manually.
tags: process, build, validation, pre-commit, typescript
applies-to: |
  Every commit that touches code (not docs-only). Especially after any structural
  refactor, replace_all edit, or rename.
related-rules:
  - self-review-before-push (workflow)
historical-incidents:
  - broken hooks + an incomplete replace_all edit shipped a TS error to main
---

## The discipline

Before `git commit`, run the project's full validation gate manually:

```bash
# Example: pnpm-based monorepo
pnpm lint        # eslint
pnpm type-check  # tsc --noEmit
pnpm test        # jest unit tests
pnpm build       # full TS build (catches what type-check might miss in some configs)
```

Or use `/dev-pipeline:validate` which does the above + browser E2E + blast radius
analysis.

If any gate fails, fix BEFORE committing. Do NOT commit + "fix in next commit" —
broken commits in history make `git bisect` and `git revert` painful.

## Why "pre-commit hook will catch it" is false comfort

The pre-commit hook can be:
- Not installed (new clone, fresh checkout)
- Broken (a previous commit modified the hook script)
- Bypassed (`git commit --no-verify`, sometimes accidentally)
- Silently failing (hook syntax error → exits 0)

A real incident had a broken pre-commit hook that silently passed. The TS error reached main.

The hook is defense-in-depth, not the primary gate. The primary gate is your conscious
"did I run the build?" check before commit.

## Specific pitfalls

### Edit tool's `replace_all` partial replacements

When using the Edit tool with `replace_all: true`:
- It replaces ALL exact matches in the file
- It does NOT replace patterns that have minor variations (different whitespace,
  different casing in nearby tokens)
- Always run `pnpm type-check` after a `replace_all` to catch the leftovers

### After Prisma schema changes

```bash
cd apps/api
pnpm db:generate     # regenerate Prisma client
cd ../..
pnpm type-check      # catch type errors against new client
```

### After dependency updates

```bash
pnpm install
pnpm build           # catch breaking changes in transitive deps
```

## Tooling

The `/dev-pipeline:validate` slash command runs the full gate. The pre-push hook
refuses pushes whose HEAD SHA isn't in `.claude/.last-reviewed-sha` (set by
`/dev-pipeline:review`), which transitively forces the validation to have run.

Both are defense-in-depth. The primary gate is YOUR habit.

## Anti-patterns

- "I'll commit and push, CI will catch it" — your turn timer is shorter than CI
- "Tests passed, build will pass" — `tsc --noEmit` is faster than full build but a
  full `tsc` build catches different issues (especially with project references)
- "Pre-commit hook will run" — verify the hook is installed; broken hooks fail silently
- "I'll fix the failing test in the next commit" — broken commits make git history
  painful
