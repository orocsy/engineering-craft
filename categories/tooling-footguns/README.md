# Tooling Footguns

**When this category bites**: a CLI does something different from what the docs imply, and you discover it only when production breaks.

**Source incidents**: getluxebook.com cutover where 10 GitHub Secrets were silently set to the literal string `"-"` because of `gh secret set --body -`.

## Rules in this category

| Rule | Impact | Trigger |
|------|--------|---------|
| [gh-secret-set-stdin](rules/gh-secret-set-stdin.md) | HIGH | Setting any GitHub Secret via `gh secret set` |

## Anti-patterns

- "The flag name suggests it does X" — read the actual behavior; some flags have surprising semantics
- "It worked once, I'll do it the same way" — verify the result, especially for secrets

## Historical incidents

| SHA / event | One-line | Rule |
|------------|----------|------|
| getluxebook.com cutover | `gh secret set --body -` set the literal string "-" as the value, silently. 10 secrets crashed the API container | gh-secret-set-stdin |
