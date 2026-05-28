# Process

**When this category bites**: tests pass + lint clean = "done" but deploy breaks; build
ran locally but not in CI; merged PR auto-deployed and crashed because nobody watched.

**Source incidents**: a post-merge deploy crash (CUSTOMER_CONTACT_HASH_SECRET
missing); broken hooks shipped a TS error to main; constant E2E headless mode
when the user wanted headed.

## Rules in this category

| Rule | Impact | Trigger |
|------|--------|---------|
| [post-merge-deploy-verification](rules/post-merge-deploy-verification.md) | HIGH | After merging any PR that auto-deploys |
| [build-validation-before-commit](rules/build-validation-before-commit.md) | HIGH | Before every git commit on the API project |

## Anti-patterns

- "Tests passed, deploy will work" — production has env validation + GitHub Secrets the test env doesn't
- "I'll commit, push will catch it" — the push hook may be broken; build locally
- "Don't need to watch the deploy, CI is reliable" — CI is reliable for the things it
  knows about; new env vars, new secrets, new infra all fall outside

## Historical incidents

| Incident | One-line | Rule |
|------------|----------|------|
| Post-merge deploy crash | Deploy crashed in prod (CUSTOMER_CONTACT_HASH_SECRET missing); not noticed for hours | post-merge-deploy-verification |
| Broken hooks to main | Broken git hooks + incomplete `replace_all` shipped TS error to main | build-validation-before-commit |
