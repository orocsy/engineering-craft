# Engineering Craft

Distilled engineering craft from real production work — defensive patterns, workflow
discipline, tooling footguns, library-choice reflexes, and process habits. Every rule
cites a historical incident SHA so readers can trace back to evidence, not opinion.

Public mirror: https://github.com/orocsy/engineering-craft. Refresh cadence: a launchd
job (`com.engineering-craft.consolidation-reminder`, every 2 days) counts pending
journal entries and posts a macOS reminder; the user runs
`/dev-pipeline:consolidate-lessons` in Claude to fold them into refined rules and
push to this mirror. Classification stays interactive because deciding "new pattern
vs refinement vs noise" needs LLM judgment.

**Multi-machine setup**: each device runs the bootstrap (`bootstrap/curl-install.sh`)
once. The journal hook captures fix-commits per-device-per-repo; consolidation can
be run on any device and pushes to the same mirror, so the curated rule set stays
unified across machines even though each device has its own local backlog.

## Fresh-machine setup (one command)

```bash
curl -fsSL https://raw.githubusercontent.com/orocsy/engineering-craft/main/bootstrap/curl-install.sh | bash
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
- [cross-file-seams](categories/cross-file-seams/README.md) ⟳ — **generated mirror** of the
  dev-pipeline plugin's `cross-file-reasoning` catalog: the 7-trace seam check (env-var
  fallback, route prefix, SDK option name, event tx semantics, mock drift, conditional
  coupling, wrapper lifecycle). Canonical source is the plugin; do not hand-edit here.

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

A three-piece pipeline owned by the [dev-pipeline plugin](https://github.com/orocsy/dev-pipeline):

1. **Capture** — `hooks/post-commit` (installed via `~/.claude/setup-git-hooks.sh`)
   appends an entry to `<repo>/.learnings/JOURNAL.md` on every commit whose subject
   matches `fix(`, `hotfix(`, `regression(`, `revert(`, or `review-fix:`. Failures
   never block the commit.
2. **Remind** — `~/Library/LaunchAgents/com.engineering-craft.consolidation-reminder.plist`
   runs every 2 days (`StartInterval=172800`), invokes a sweep script that counts
   unconsolidated entries across `~/projects/*/.learnings/JOURNAL.md`, and posts a
   macOS notification when the backlog warrants it. Silent on zero backlog.
   Installed automatically by `bootstrap/install.sh` (step 7); points at the
   dev-pipeline plugin's `hooks/consolidate-lessons-notify.sh` so the script body
   updates with `git pull` on the plugin, not with `git pull` on this repo.
3. **Consolidate (interactive)** — the user runs `/dev-pipeline:consolidate-lessons`
   in Claude. The command classifies each entry against existing categories
   (`new-pattern` / `refinement` / `noise`), updates files in this repo's local
   clone, commits + pushes, and marks processed entries with
   `<!-- consolidated: YYYY-MM-DD verdict=... -->` so future runs skip them.
   Source journals are edited in place but never auto-committed; the user pushes at
   their own cadence.

Why not fully automatic via `claude -p`? Classification is the LLM-judgment-heavy
part — fully scheduled runs would either rubber-stamp noise into the repo or fail
silently on auth issues. Notification + interactive review keeps quality high.

## Contributing

Patterns from other projects welcome. Follow the existing rule format:
frontmatter (title/impact/applies-to/related-rules/historical-incidents) + body
(Why-this-matters / Incorrect / Correct / Tests / Anti-patterns / References).

## License

MIT.
