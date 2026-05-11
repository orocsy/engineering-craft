# Production Defensive Patterns

Curated defensive-engineering patterns distilled from real post-merge production
incidents. Every rule cites a historical incident SHA so readers can trace back
to evidence, not opinion.

## Categories

- [concurrency-cas](categories/concurrency-cas/README.md) — Redis Lua / Postgres
  WHERE-predicate compare-and-swap, state machine drawing requirement, race-test
  contract, sibling-resource invariants
- [enumeration-safety](categories/enumeration-safety/README.md) — status & timing
  oracles, multi-tenant fail-closed, equalizer quality bar
- [config-drift](categories/config-drift/README.md) — 4-consumer rule (env.schema /
  deploy.yml / .env.example / docs), validator-runbook parity, env-deploy parity test
- [silent-no-op-integrations](categories/silent-no-op-integrations/README.md) —
  configured-state-visible boot log, *Required() variant for security, regression-test
  the no-op branch
- [grep-for-siblings](categories/grep-for-siblings/README.md) — every security-relevant
  literal removal triggers a repo-wide grep; renames need 7 separate searches

## Templates (copy-paste ready)

See [templates/](templates/) for: race-test, Lua CAS-and-delete, Lua CAS-and-increment,
Postgres optimistic CAS, enumeration test suite, env-deploy parity spec, integration
boot-mode log.

## Checklists

- [Pre-merge self-review](checklists/pre-merge-self-review.md)
- [New env var](checklists/new-env-var.md)
- [New third-party integration](checklists/new-third-party-integration.md)
- [Auth/OTP/password feature](checklists/auth-otp-feature.md)

## How this stays alive

This repo is auto-updated by the dev-pipeline plugin's
`/dev-pipeline:consolidate-lessons` command. It reads a journal of review-fix
commits, fetches the actual diffs, and refines the rules every 2 days.

Written content reflects observed reality: the next `Codex` review-fix on a
LuxeBook PR triggers the journal hook → consolidation reads the diff → if a new
pattern is detected, a new rule appears here within 48 hours.

## Contributing

Patterns from other projects welcome. PRs should follow the existing rule format:
frontmatter with title/impact/applies-to/related-rules/historical-incidents, body
sections Why-this-matters / Incorrect / Correct / Tests / Anti-patterns / References.

## License

MIT.
