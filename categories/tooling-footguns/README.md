# Tooling Footguns

**When this category bites**: a CLI does something different from what the docs imply, and you discover it only when production breaks.

**Source incident**: a production domain cutover where 10 GitHub Secrets were silently set to the literal string `"-"` because of `gh secret set --body -`.

## Rules in this category

| Rule | Impact | Trigger |
|------|--------|---------|
| [gh-secret-set-stdin](rules/gh-secret-set-stdin.md) | HIGH | Setting any GitHub Secret via `gh secret set` |
| [dockerignore-nested-patterns](rules/dockerignore-nested-patterns.md) | CRITICAL | Any monorepo .dockerignore meant to exclude nested files (env files, keys) |
| [zsh-loops-and-special-variables](rules/zsh-loops-and-special-variables.md) | HIGH | Any zsh loop over `$var`, a variable named `path`/`fpath`/`cdpath`/`manpath`, `==` inside `[ ]`, a word starting with `=`, or an unquoted glob that may match nothing |
| [mask-secrets-by-key-name](rules/mask-secrets-by-key-name.md) | HIGH | Printing an env file, `printenv` or a config while checking a setup |

## Anti-patterns

- "The flag name suggests it does X" — read the actual behavior; some flags have surprising semantics
- "It worked once, I'll do it the same way" — verify the result, especially for secrets

## Historical incidents

| Incident | One-line | Rule |
|------------|----------|------|
| Production domain cutover | `gh secret set --body -` set the literal string "-" as the value, silently. 10 secrets crashed the API container | gh-secret-set-stdin |
