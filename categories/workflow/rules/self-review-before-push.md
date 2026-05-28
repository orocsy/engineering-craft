---
title: Self-Review the Diff With code-reviewer Agent BEFORE Every Push
last-referenced: 2026-05-12
maturity: proven
type: process
impact: CRITICAL
impact-description: |
  Post-merge review is a second opinion, not the primary correctness filter. A real
  review cycle had an A→B→A race that the automated reviewer missed but the local
  code-reviewer agent caught. Without self-review, the post-merge reviewer IS the
  primary filter — that loop is expensive in tokens and wall-clock.
tags: workflow, review, code-review, agent, self-review
applies-to: |
  Every push of any branch. No exceptions.
related-rules:
  - push-back-on-reviews-when-verified
historical-incidents:
  - A real review cycle (the automated reviewer missed an A→B→A race; the local reviewer caught it)
---

## The discipline

Before `git push`, dispatch a code-reviewer agent against the diff:

```
Agent({
  description: "Independent code review on current diff",
  subagent_type: "code-reviewer",
  prompt: "Review the diff at `git diff main...HEAD` independently. I'm shipping
           <feature> and have already passed engineering-craft pre-merge-self-review
           checklist. Look for: race conditions across endpoints, enumeration leaks,
           config drift, silent no-op integrations, sibling-resource invariants. Report
           any concerns; if clean, say so explicitly."
})
```

If the agent surfaces real findings, fix and re-review. Do NOT push with open findings.

## Why local self-review beats relying on post-merge review

- **Latency**: local agent runs in ~3 minutes; post-merge review takes minutes to hours after push
- **Iteration cost**: local fix-and-retry stays in your context; a post-merge round-trip needs
  PR comment parsing, branch sync, repush, re-deploy
- **Token economics**: a local cheaper model is cheaper per turn than post-merge review + your fix +
  push round trip
- **Catches different bugs**: code-reviewer agent has more context (your conversation,
  the design intent) than a post-merge reviewer (just the diff). The post-merge reviewer
  catches things you missed; the agent catches things only-someone-with-context could spot.

The pattern is THREE LAYERS, each catching different errors:

1. Pre-merge self-review checklist (you read it before/during coding)
2. Local code-reviewer agent (post-coding, pre-push)
3. External / post-merge PR review (post-push)

Without layer 2, layer 3 is the only filter — and one real review cycle showed what 5 rounds of
layer 3 alone looks like.

## Wired into /dev-pipeline:review

`/dev-pipeline:review` runs this for you. Use it before every `git push`. The pre-push
hook also refuses pushes whose HEAD SHA isn't in `.claude/.last-reviewed-sha`, so
forgetting is gated.

## Anti-patterns

- "Tests pass + lint clean + I read the diff myself = enough" — you have implementer's
  blindness; the agent doesn't
- "The post-merge reviewer will catch the race conditions" — sometimes; the local agent
  catches them faster and the workflow is cheaper
- "I'll skip review for tiny diffs" — tiny diffs that touch security/concurrency are
  the most dangerous (small surface = less testing)
