---
title: Running "The Equivalent Commands" Silently Drops Every Composed Gate
last-referenced: 2026-08-06
maturity: proven
type: guideline
impact: CRITICAL
impact-description: |
  A pipeline had a dedicated gate for exactly the failure that shipped — wired into both
  the validate and review commands, auto-triggered by two conditions the diff met. It
  never ran, because validation was performed as raw `typecheck && test && lint` and
  review as ad-hoc reviewers. Both substitutions look complete, are strictly weaker, and
  leave an audit trail that reads as if the gates passed.
tags: ci, gates, process, audit-trail, pipeline, false-green, verification
applies-to: |
  Any time you execute a composed quality step by hand instead of invoking the command
  that composes it: running package scripts instead of the project's validate command,
  spawning your own reviewers instead of the review command, or "just running the tests"
  before a push.
related-rules:
  - probe-must-fail-on-injected-defect
  - skip-is-a-decision-not-a-default
  - build-validation-before-commit
historical-incidents:
  - a real incident: an SDK upgrade deleted a hand-written `.d.ts` and changed two
    dependency versions — the two documented auto-invoke triggers of the project's
    SDK-surface gate. The gate was wired into both the validate and the review command and
    ran in neither, because both were hand-rolled. The gate's own docstring described a
    PRIOR incident of the same class in the same project. `grep -c <gate> agent-events.jsonl`
    returned 0 while the same file held four `review.complete` records.
---

## The pattern

A mature pipeline command is not a convenience alias. It is a COMPOSITION: `validate`
means lint + types + unit + contract-probe + SDK-surface + blast-radius, and the
composition is where the expensive, incident-derived steps live.

When you run `pnpm typecheck && pnpm test && pnpm lint` instead, you have not run a
subset by accident — you have run the CHEAP, GENERIC subset and dropped precisely the
project-specific steps that exist because something once shipped broken. The output looks
like a full validation. It is green. It is also missing the only check that could have
caught the thing you are about to ship.

The same holds for review: spawning your own reviewers covers the dimensions you thought
of. The composed review command additionally invokes gates whose triggers you would not
have evaluated, because their whole purpose is to fire on conditions humans forget.

## Why it looks safe

The hand-rolled version is honestly reported ("typecheck, tests, lint: all green"), and
every claim in that sentence is true. Nothing signals absence. A missing step produces no
output at all — the failure mode of a gate that did not run is silence, which is
indistinguishable from a gate that ran and passed unless something records the difference.

It is also actively tempting: the composed command is slower, occasionally interactive,
and the direct commands are what you already have in shell history.

## Incorrect

```bash
# "Validation" before push — looks thorough, drops every composed gate.
pnpm typecheck && pnpm -r test && pnpm lint && pnpm build
# → SDK-surface gate: never evaluated
# → blast-radius / contract gates: never evaluated
# → audit trail: nothing recorded, so later greps find no evidence either way
```

## Correct — invoke the composition, or prove the step ran

```bash
pnpm validate        # or the project's composed command
```

When invoking the composition is genuinely impractical, make absence detectable:

```bash
# Each gate appends a record keyed to the exact SHA it verified.
echo "{\"gate\":\"sdk-surface\",\"sha\":\"$(git rev-parse HEAD)\",\"ts\":\"$(date -u +%FT%TZ)\"}" \
  >> .claude/agent-events.jsonl

# CI fails when a gate's TRIGGER is true but no record exists for this SHA.
if git diff --name-only "$BASE"..HEAD | grep -qE '\.d\.ts$|package\.json$|pnpm-lock\.yaml$'; then
  grep -q "\"gate\":\"sdk-surface\",\"sha\":\"$(git rev-parse HEAD)\"" .claude/agent-events.jsonl \
    || { echo "SDK-surface gate required for this diff but never ran"; exit 1; }
fi
```

The asymmetry that matters: a gate that ran and passed, and a gate that never ran, must
not produce the same evidence. Make the second one loud.

## The tell, in review

- A validation summary that lists generic steps (types, tests, lint, build) and no
  project-specific gate, on a diff that touches a dependency, a type stub, or a
  lifecycle path.
- An audit log containing completion records for the steps you remembered and none for
  the ones the pipeline composes.
- "I ran the equivalent commands" — treat as an unproven claim, exactly like "I tested it
  manually".
- A gate whose docstring cites a prior incident, in a repo where that incident class just
  recurred. That is the strongest possible signal that the gate exists and was bypassed.

## Executable gate

For each composed gate, define its trigger as a diff predicate and enforce
trigger ⇒ record-for-this-SHA in CI. This converts "someone should remember to run it"
into a build failure, which is the only form of process that survives a deadline.

## See also

- `probe-must-fail-on-injected-defect` — the gate that runs but asserts the wrong thing
- `skip-is-a-decision-not-a-default` — the sibling failure: the check ran and opted out
- `build-validation-before-commit` — what the composed step is protecting
