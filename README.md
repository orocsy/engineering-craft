# Engineering Craft

Distilled engineering craft from real production work — defensive patterns, workflow
discipline, tooling footguns, library-choice reflexes, and process habits. Every rule
cites a historical incident SHA so readers can trace back to evidence, not opinion.

Public mirror: https://github.com/orocsy/engineering-craft (auto-updated every 2 days
via `/dev-pipeline:consolidate-lessons`)

## Two macro-groups

### Defensive patterns

- [concurrency-cas](categories/concurrency-cas/README.md) — Redis Lua / Postgres
  WHERE-predicate compare-and-swap, state machine drawing requirement, race-test
  contract, sibling-resource invariants
- [enumeration-safety](categories/enumeration-safety/README.md) — status & timing
  oracles, multi-tenant fail-closed, equalizer quality bar
- [config-drift](categories/config-drift/README.md) — 4-consumer rule, validator-runbook
  parity, env-deploy parity test, secret-existence-vs-exposure
- [silent-no-op-integrations](categories/silent-no-op-integrations/README.md) —
  configured-state-visible, *Required() variant, regression-test the no-op
- [grep-for-siblings](categories/grep-for-siblings/README.md) — security literal
  removal triggers repo-wide grep; renames need 7 separate searches

### Process & habits

- [workflow](categories/workflow/README.md) — pull main before branching, branch
  naming, self-review before push, push-back on reviews
- [tooling-footguns](categories/tooling-footguns/README.md) — `gh secret set --body -`
  silent-misuse and other CLI surprises
- [library-choice](categories/library-choice/README.md) — libraries first; don't
  hand-roll regex/parsing/dates/URLs
- [process](categories/process/README.md) — post-merge deploy verification,
  build validation before commit

## Templates (copy-paste)

[templates/](templates/): race-test, Lua CAS-and-delete, Lua CAS-and-increment,
Postgres optimistic CAS, enumeration test suite, env-deploy parity spec, integration
boot-mode log.

## Checklists

- [Pre-merge self-review](checklists/pre-merge-self-review.md)
- [New env var](checklists/new-env-var.md)
- [New third-party integration](checklists/new-third-party-integration.md)
- [Auth/OTP/password feature](checklists/auth-otp-feature.md)

## How this stays alive

Auto-updated by the dev-pipeline plugin's `/dev-pipeline:consolidate-lessons` command.
A journal of review-fix commits is folded into refined rules every 2 days; updated
content auto-pushes to the public mirror.

## Contributing

Patterns from other projects welcome. Follow the existing rule format:
frontmatter (title/impact/applies-to/related-rules/historical-incidents) + body
(Why-this-matters / Incorrect / Correct / Tests / Anti-patterns / References).

## License

MIT.
