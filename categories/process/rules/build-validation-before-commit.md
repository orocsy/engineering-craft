---
title: Run pnpm build (or project equivalent) BEFORE Every Commit
last-referenced: 2026-08-01
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
  - "private React refactor (2026-08-01): the production build alone did not define the full quality gate; adding strict `tsc --noEmit` initially scanned generated output and scratch dependency trees, then a deliberate first-party include/exclude boundary plus separate lint, unit and production-build gates produced a reliable check"
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

## A strict gate needs a deliberate input boundary

Adding `tsc --noEmit` or `eslint .` is not enough if the tool scans generated
output, browser artifacts, scratch clones or incomplete dependency experiments.
That creates two bad outcomes: engineers disable the stricter gate because it is
noisy, or they waste time fixing code the product does not own.

A real React refactor exposed this sequence:

1. The feature had grown inside a few large client modules and the existing
   production build passed.
2. A standalone strict typecheck was added to expose client/server contract and
   library-union mistakes earlier.
3. The broad TypeScript project also included generated output and scratch
   dependency directories, producing failures outside first-party source.
4. The correction was not to weaken strictness. It was to define first-party
   scope deliberately, install the runtime's official types, and keep shared
   DTOs in implementation-neutral contract modules.
5. The final gate ran typecheck, lint, unit tests and production build because
   each tool exercised a different seam.

```jsonc
{
  "include": ["app/**/*.ts", "app/**/*.tsx", "worker/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", ".next", "dist", "output", "work"],
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "types": ["node", "@runtime/official-types"]
  }
}
```

Do not blindly copy these paths. The rule is to name **owned inputs** and
**generated/scratch outputs** explicitly, then add a small check that a new
first-party source root cannot be introduced outside the configured scope.

### Keep contracts out of implementation graphs

If a client needs a response type, do not import that type from a server store
module that also imports database/runtime code:

```ts
// ❌ Client type import points through the server implementation module.
import type { SharedEnvelope } from "../server/store";

// ✅ Both sides depend on an implementation-neutral contract.
import type { SharedEnvelope } from "../contracts/shared-envelope";
```

Type-only imports reduce emitted JavaScript, but a clean dependency direction
still matters for tooling, refactors and accidental future value imports.

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

### After adding a stricter validator

```bash
# Confirm the gate sees every first-party source root...
pnpm type-check

# ...but does not scan generated artifacts or scratch worktrees.
pnpm lint
pnpm test
pnpm build
```

Record why every exclusion exists. An exclusion should describe a non-source
boundary, not hide a failing owned module.

## Tooling

The `/dev-pipeline:validate` slash command runs the full gate. The pre-push hook
refuses pushes whose HEAD SHA isn't in `.claude/.last-reviewed-sha` (set by
`/dev-pipeline:review`), which transitively forces the validation to have run.

Both are defense-in-depth. The primary gate is YOUR habit.

## Anti-patterns

- "I'll commit and push, CI will catch it" — your turn timer is shorter than CI
- "Tests passed, build will pass" — `tsc --noEmit` is faster than full build but a
  full `tsc` build catches different issues (especially with project references)
- "Exclude the directory until CI is green" — only exclude generated, vendored or
  scratch content; owned source errors stay in scope
- "The bundler passed, so client/server imports are safe" — bundlers and standalone
  typecheckers walk different graphs
- "Pre-commit hook will run" — verify the hook is installed; broken hooks fail silently
- "I'll fix the failing test in the next commit" — broken commits make git history
  painful
