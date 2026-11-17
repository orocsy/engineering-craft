# Engineering Craft

Distilled engineering craft from real production work — defensive patterns,
frontend state, portable data contracts, workflow discipline, tooling footguns,
library-choice reflexes, and process habits. Every rule cites a historical
incident so readers can trace back to evidence, not opinion.

Public mirror: https://github.com/<org>/engineering-craft. Refresh cadence: the dev-pipeline
learning watcher captures every session continuously and proposes new and refined rules daily
on a local `learning/inbox` branch; a person reviews, merges and pushes (see "How this stays
alive" below). Nothing private may land here — see [PRIVACY.md](PRIVACY.md).

**Multi-machine setup**: each device runs the bootstrap (`bootstrap/curl-install.sh`)
once. The journal hook captures fix-commits per-device-per-repo; consolidation can
be run on any device and pushes to the same mirror, so the curated rule set stays
unified across machines even though each device has its own local backlog.

## Fresh-machine setup (one command)

```bash
curl -fsSL https://raw.githubusercontent.com/<org>/engineering-craft/main/bootstrap/curl-install.sh | bash
```

Clones engineering-craft, then runs `bootstrap/install.sh` which:
- Clones the dev-pipeline plugin (private — needs SSH or HTTPS+token)
- Clones spec-forge (private — same)
- Installs hooks at `~/.claude/hooks/`
- Merges hook registrations into `~/.claude/settings.json` (jq-merge, doesn't clobber)
- Installs the launchd 2-day consolidation reminder

Idempotent — safe to re-run. See [bootstrap/HANDOFF.md](bootstrap/HANDOFF.md) for prerequisites,
SSH-vs-HTTPS overrides, troubleshooting, and uninstall instructions.

If you've already cloned this repo, run the installer directly:
```bash
bash ~/.claude/skills/engineering-craft/bootstrap/install.sh
```

Or from inside Claude Code:
```
/dev-pipeline:setup-machine
```

## Quick category map

See [INDEX.md](INDEX.md) for the complete category, maturity and trigger
catalog.

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
- [observability](categories/observability/README.md) — three pillars (errors/analytics/
  health) every signal sliceable per-tenant; PII scrubbing as defense-in-depth (an SDK
  flag is not enough); tag tenant unconditionally + guard against untagged leaks;
  identify/reset lifecycle + contained captures
- [auth-identity](categories/auth-identity/README.md) — unauthenticated OAuth may only
  sign in an already-linked subject; email_verified ≠ ownership; identity does
  not imply paid provider API entitlement
- [python-fastapi](categories/python-fastapi/README.md) — app factory, closed liveness
  checks, CI-matching test env, one error shape for all four default paths, server request
  IDs, contract-file response validation
- [cross-file-seams](categories/cross-file-seams/README.md) ⟳ — **generated mirror** of the
  dev-pipeline plugin's `cross-file-reasoning` catalog: the 7-trace seam check (env-var
  fallback, route prefix, SDK option name, event tx semantics, mock drift, conditional
  coupling, wrapper lifecycle). Canonical source is the plugin; do not hand-edit here.

### Frontend & interchange patterns

- [frontend-async-state](categories/frontend-async-state/README.md) — latest
  user intent owns asynchronous state and navigation outcomes
- [frontend-design-system-drift](categories/frontend-design-system-drift/README.md)
  — typed tokens and explicit breakpoint bases prevent silent CSS drift
- [e2e-test-resilience](categories/e2e-test-resilience/README.md) — resilient
  selectors and harness-only identity for isolated multi-user tests
- [accessibility-state-sync](categories/accessibility-state-sync/README.md) —
  visible overlay state, ARIA references and viewport positioning stay aligned
- [portable-artifacts](categories/portable-artifacts/README.md) — one
  deterministic machine artifact for exact round-trip; documents, diagrams and
  AI outputs are human projections or reviewed proposals

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
- [iOS / SwiftUI surface](checklists/ios-swiftui-surface.md) — design-system components, Dynamic Type, VoiceOver, Reduce Motion, Swift 6 concurrency, tests

## How this stays alive

Owned by the [dev-pipeline plugin](https://github.com/<org>/dev-pipeline)'s learning watcher
(`tools/learning-watcher/`). See [knowledge-management/capture-from-transcripts-on-a-schedule](categories/knowledge-management/rules/capture-from-transcripts-on-a-schedule.md) for why it works this way.

1. **Capture (every 15 min, no model).** A launchd job reads the lines appended to each Claude
   Code session transcript since its cursor and writes a redacted journal entry per burst of
   work: skills and commands used, tool errors and retry loops, reverts, review findings, user
   corrections, recaps, tests that went green. The journal lives outside every repository.
2. **Consolidate (daily, capped).** A size-capped digest of new entries goes to `claude -p`
   with a hard dollar and turn cap, no shell, and write access only to a `learning/inbox`
   worktree of this repo (and of dev-pipeline, for recipe proposals). It classifies entries
   as `new-pattern` / `refinement` / `noise`, merges well-known practice for the stack with
   sources cited, and commits locally — only if the privacy gate passes.
3. **Publish (a person).** Review `git log main..learning/inbox`, merge, push. The pre-push
   privacy gate checks every push to this public mirror, by hand or not. See [PRIVACY.md](PRIVACY.md).

The older pieces still work: the post-commit hook still journals fix-shaped commits into
`<repo>/.learnings/JOURNAL.md`, and `/dev-pipeline:consolidate-lessons` still folds those in
interactively (now privacy-linted, pushing only on a yes). The two-day reminder plist is
superseded by the daily consolidation.

Why an unattended `claude -p` is now acceptable when it was not before: it can no longer
rubber-stamp noise into the catalog (it writes to a review branch, never `main`), and it
cannot fail silently (a run that never reached the model leaves its entries pending and says
so in the notification).

## Contributing

Patterns from other projects welcome. Follow the existing rule format:
frontmatter (title/impact/applies-to/related-rules/historical-incidents) + body
(Why-this-matters / Incorrect / Correct / Tests / Anti-patterns / References).

## License

MIT.
