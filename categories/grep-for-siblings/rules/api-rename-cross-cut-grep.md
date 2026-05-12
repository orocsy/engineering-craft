---
title: Renaming a Function/Type/Flag Triggers Multi-Search
last-referenced: 2026-05-12
maturity: verified
type: process
impact: HIGH
impact-description: |
  TypeScript catches direct calls but misses string literals containing the name,
  dynamic imports, re-exports, test mocks, and barrel files. Renames need ≥6 separate
  greps to catch every form.
tags: refactor, rename, grep, typescript
applies-to: |
  Renaming any: function, class, type, interface, enum value, env var, route path,
  CSS class, GraphQL field, Prisma model field.
related-rules:
  - security-literal-grep
historical-incidents:
  - PR#59 round 4 (parseISO timezone bug across 6 callers)
---

## TypeScript is necessary but not sufficient

TypeScript catches:
- Direct calls (`foo()` → renamed `bar()` → `foo()` is undefined)
- Type-level references (`type X = foo` → similar)

TypeScript MISSES:
- String literals containing the name (`'foo'` for dispatch tables, registries, dynamic
  routes)
- Dynamic imports (`require('./foo')`, `await import('./foo')`)
- Re-exports (`export { foo } from './foo'`) — these often go through barrel files
- Test mocks (`jest.mock('./foo')`)
- JSDoc references (`@see foo`)
- Documentation
- Database column names (if the name is a Prisma field that maps to a column)

## The discipline (per User-Level CLAUDE.md Directive #10)

When renaming, search separately for:

1. Direct calls/references — TypeScript covers this, but verify with `grep -rn 'foo('`
2. Type-level references — `grep -rn ': foo\|<foo' ` (interfaces, generics)
3. String literals containing the name — `grep -rn '"foo"\|'\''foo'\''`
4. Dynamic imports and `require()` calls — `grep -rn "require\(.*foo\|import.*foo"`
5. Re-exports and barrel file entries — `grep -rn "export.*foo"`
6. Test files and mocks — `grep -rn "foo" '**/__tests__/' '**/*.spec.ts'`
7. Documentation — `grep -rn "foo" docs/ README.md AGENTS.md CLAUDE.md`

For env-var renames, also include:
8. `.github/workflows/*` — `-e VAR_NAME=...`
9. `.env.example` files
10. Vercel project env vars (out-of-band check via Vercel API)
11. GitHub Secrets (`gh secret list`)

## Worked example: renaming `parseISO` (PR#59)

The pre-PR#59 codebase had `parseISO` from `date-fns` used as a default in 6 files.
PR#59 wanted to swap to `fromZonedTime` from `date-fns-tz` in one file. The rename
caught the direct call but missed:

- 5 other files still called `parseISO`
- The PR landed; tests passed (UTC environment masked the bug)
- 2 weeks later: production EC2 ran in UTC ✓; local dev ran in HKT ✗
- Local dev started exhibiting timezone bugs that didn't repro in CI
- Root cause: 5 files still used `parseISO` (UTC-naive); needed sweep

The grep that should have caught it on day 1:

```bash
grep -rn "parseISO\b" apps/ --include="*.ts"
```

(The `\b` word boundary avoids matching `parseISOExtended` if it existed.)

## Templates per rename type

### Function rename

```bash
grep -rn "\boldName\b" apps/ packages/ --include="*.ts" --include="*.tsx"
grep -rn "'oldName'\|\"oldName\"" apps/ packages/
grep -rn "@see oldName\|@link oldName\|@returns oldName" apps/ packages/
grep -rn "oldName" docs/ '*.md'
```

### Type rename

```bash
grep -rn "\boldType\b" apps/ packages/ --include="*.ts" --include="*.tsx"
# Includes generics, function signatures, return types
grep -rn ": oldType\|<oldType\|extends oldType\|implements oldType" apps/ packages/
```

### Env var rename

```bash
# Code consumers
grep -rn "\bOLD_VAR\b" apps/ packages/ --include="*.ts" --include="*.tsx"
# Config consumers
grep -rn "OLD_VAR" .github/ .env* docs/ vercel.json
# GitHub secret
gh secret list -R owner/repo | grep OLD_VAR
```

### Route path rename (e.g., `/api/v1/forgot-password` → `/api/v1/auth/forgot-password`)

```bash
# Frontend client code
grep -rn "/forgot-password" apps/admin/ apps/booking/
# Backend route declarations
grep -rn "forgot-password" apps/api/src/
# Tests, docs, openapi spec
grep -rn "forgot-password" '*.md' 'docs/' 'spec/'
```

## Pre-merge checklist for renames

- [ ] All 7 (or more, for env vars) grep families run
- [ ] Each match classified: rename target / false positive / out-of-scope
- [ ] All targets renamed in this commit
- [ ] Build still passes (TS catches the direct calls)
- [ ] Tests still pass (catches dynamic imports + mocks)
- [ ] Doc references updated

## Anti-patterns

- "TypeScript will catch it" — direct calls only
- "I'll search later" — deferred sweeps don't happen
- "It's just a internal helper" — internal helpers get re-exported via barrel files
- "Tests will fail if I miss something" — tests cover happy paths, not all callers

## Tooling

VS Code `Find Symbol References` is closer to ground truth than grep but still misses
dynamic patterns. Prefer grep for completeness; use IDE for cross-checking the file:line
of true matches.

The `unknown:explore` agent (or general-purpose Agent with Explore subagent) can run
all 7 greps in parallel and report; useful for large refactors.
