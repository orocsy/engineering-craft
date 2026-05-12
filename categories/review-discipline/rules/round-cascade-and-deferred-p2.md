---
title: Codex Rounds Cascade — Treat Deferred P2 as Scheduled, Run Self-Review First
type: process
maturity: proven
last-referenced: 2026-05-12
impact: HIGH
impact-description: |
  Codex/PR-bot rounds keep finding sibling concerns even after rounds 1-4 reach 0 P1.
  A "P2 deferred" in round 1 routinely becomes a P1 in round 3. Self-review found a
  race that Codex round 4 missed (PR#37). E2E green ≠ correctness.
tags: review, codex, rounds, self-review, deferred-p2, e2e
applies-to: |
  Every PR with ≥2 review rounds; every "P2 deferred" annotation; every post-E2E-green
  merge; any commit message that says "fix: address N more Codex round-K findings."
related-rules:
  - self-review-before-push
  - push-back-on-reviews-when-verified
historical-incidents:
  - PR #66 5 sequential Codex rounds (e96c5f7, 5532bee, e035138, dfad758, 64eeb08)
  - PR #85 4 sequential Codex rounds (89bffb6, 0428f5f, 11fb1aa, 2c4e5b0)
  - PR #79 ad5872a — P2s deferred from earlier rounds came back as P1
  - 1bea785 — "two bugs caught only by careful flow review post-E2E"; passed E2E green, failed business-logic reasoning
  - 2c739b2 — A→B→A race on PR #37 caught by self-review; Codex round 4 missed it
---

## Why this matters

PR#66 had 5 Codex rounds. PR#85 had 4. The pattern across both:

- Round 1: Codex finds 3-5 P1s. You fix.
- Round 2: Codex finds 2-3 different P1s + some P2s. You fix P1s, defer P2s.
- Round 3: A round-2 P2 returns as a P1 because the surrounding code changed.
- Round 4: Codex digs into a sibling concern triggered by your round-3 fix.
- Round 5: Audit finds something neither Codex nor you caught.

**The structural mistake** is treating each round's findings as the COMPLETE set
of issues at that depth. They aren't — they're samples from an underlying class
of issue. The fix to the sample doesn't address the class, so the class keeps
producing more samples.

## Three reflexes that break the cascade

### 1. Self-review BEFORE Codex (not after)

Codex sees the diff. Your local code-reviewer agent sees the diff PLUS your
conversation context (design intent, prior decisions, why-not's). The agent
catches different bugs than Codex.

Run self-review BEFORE pushing. Per [self-review-before-push](../../workflow/rules/self-review-before-push.md):

```
Agent({
  description: "Independent code review on current diff",
  subagent_type: "code-reviewer",
  prompt: "Review the diff at git diff main...HEAD. I'm shipping <feature>...
           Look for: race conditions, enumeration leaks, config drift, silent
           no-op integrations, sibling-resource invariants, status denylist
           creep, cross-tx CAS recompute, payload shape drift. Report any
           concerns; if clean, say so."
})
```

Codex becomes a SECOND opinion, not the primary filter. Loop iterations stay
local (cheap), not Codex round-trips (expensive).

### 2. Treat "P2 deferred" as scheduled, not deferred

If round 1 surfaces a P2, schedule it for the next commit in the SAME PR. Don't
merge with open P2s "to be addressed in a follow-up PR" — follow-up PRs rarely
land on the same timescale and the P2 escalates to P1 in the meantime as the
surrounding code evolves.

The exception: a P2 that's clearly out-of-scope and would significantly grow
the PR. Spawn it as a separate task tracker entry in the same review thread,
linked back. Don't just say "deferred."

### 3. Post-E2E-green "careful flow review"

E2E tests assert state (after action X, the page shows Y). They DON'T reason
about state-transition combinatorics (after X then Z then X again, what's the
state of W?). PR `1bea785` shipped two bugs through green CI because nothing
walked through the user-flow business logic combinatorially.

After E2E goes green, do one explicit pass focused on:
- Sequence of state transitions (A → B → A)
- Edge-case combinations (deposit + late-cancel + credit overlap)
- "What happens if the user does X right after Y" scenarios

This is NOT "another round of automated tests." It's a human walking through
the flow with adversarial intent.

## Anti-pattern: commit-message hygiene

Commit messages like `fix: address N more Codex round-K findings` are a smell.
The fix should land in the original PR before merge, not as a follow-up commit
after merge. If you find yourself writing this commit message, you've already
let the cascade win.

If the cascade IS happening, the commit message should also describe WHY round
K wasn't caught earlier:
> fix(auth): close 3 more Codex round-3 findings — root cause was missing
> state-machine drawing at design phase. Adding state-machine-first to
> review checklist for next auth feature.

The "why missed" → automatic rule capture in the next consolidation.

## How this composes with engineering-craft

The deeper pattern is: **Codex finds the same classes of bugs that engineering-craft
documents.** Loading the matching category READMEs in `/dev-pipeline:review` STEP 1.5
BEFORE Codex sees the PR closes the gap. The reviewer agents have the same priors
Codex would have brought, so the round-1 catch rate goes up dramatically.

Empirically (PR#85 retro): 9 of 11 Codex findings would have been caught by the
state-machine-first + race-test-contract + storage-gate-not-js reflexes if those
rules had been loaded at design phase.

## Tests / metrics

Track per-PR:
- **Rounds-to-zero-P1**: number of Codex rounds before all P1s are closed. Target: 1.
- **Deferred-P2-resurrection-rate**: % of round-N P2s that became round-(N+1) P1s. Target: 0%.
- **Post-merge revert rate**: % of merged PRs that need a hotfix within 7 days. Target: 0%.

When any metric drifts, it's a signal that:
- engineering-craft is missing a rule (capture it)
- The rule exists but didn't fire (improve trigger description / scenario mapping)
- The rule fired but was ignored (process discipline gap)

## Anti-patterns

- "Round 1 is clean of P1, ship it" — round 2 finds a P1 from a different angle
- "P2 deferred to follow-up PR" — the follow-up never lands on time
- "E2E green = correct" — E2E doesn't reason about combinatorics
- Auto-applying every Codex finding without verification — accumulates defensive
  cruft (see [push-back-on-reviews-when-verified](../../workflow/rules/push-back-on-reviews-when-verified.md))
- "I'll skip self-review for tiny diffs" — tiny diffs in security/concurrency
  paths are the most dangerous (less testing surface)
