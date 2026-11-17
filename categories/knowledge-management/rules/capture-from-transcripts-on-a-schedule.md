---
title: Capture lessons from session transcripts on a schedule — not from hooks, not at "task end"
type: process
maturity: draft
impact: HIGH
impact-description: |
  A knowledge base only grows from what reaches it. Event hooks fire only on
  particular events in particular sessions, and "consolidate when the task is
  done" assumes tasks end. In parallel multi-session work neither holds, so the
  catalog silently stops learning while the work goes on.
tags: knowledge-management, capture, consolidation, privacy, scheduling
applies-to: |
  Designing or repairing how lessons enter this catalog (or any team knowledge base
  fed by agent sessions); deciding where a capture or consolidation step runs.
related-rules:
  - skill-as-knowledge-base
historical-incidents:
  - "several weeks of parallel agent sessions (backend, web, mobile lanes) produced almost no journal entries: the commit hook caught only fix-shaped commit subjects, and the every-two-days reminder to consolidate by hand was rarely acted on because no task ever reached a clear end"
  - "first ten days of transcript capture: most sessions used no pipeline command at all, which no commit hook could have seen"
last-referenced: 2026-11-18
---

## The rule

Capture from the **transcripts**, on a **timer**, in **two tiers**:

1. **Capture (cheap, deterministic, frequent).** A scheduler (launchd, cron, systemd timer)
   reads only the bytes appended to each transcript since a stored cursor, extracts signals
   with plain code — commands and skills used, tool errors and repeated retries, reverts,
   review findings, user corrections, interruptions, recaps, tests that went green after
   failing — redacts them, and appends a journal entry. No model call, so it can run every
   few minutes. Make it idempotent (entry IDs derived from file and byte offset) and bounded
   (bytes per run).
2. **Consolidate (judgment, slow, capped).** Daily, build a size-capped digest from the new
   entries and give a model only that digest. Hard-cap spend and turns, skip the run when
   little is new, and let it write only to a review branch. A person merges.

## Why it works where hooks and end-of-task steps failed

- The transcript is the one place every session writes to, whatever the project, branch or
  tool, so nothing depends on a particular hook firing.
- A timer does not need the task to end. Work in progress is captured per burst of activity
  (wait until the session has been idle for a while), which also keeps entries meaningful.
- Splitting deterministic capture from model judgment makes the frequent part free and the
  expensive part bounded and reviewable.

## Privacy is part of the design, not a follow-up

Transcripts hold keys, emails, customer names and business details. Redact before writing
the journal, keep the journal out of every repository, and put a hard gate (a lint that
refuses secrets, emails, prices, unknown domains, people's names and a private-terms list)
both on the consolidation diff and as a pre-push hook on anything that publishes.

## Anti-patterns

- ❌ "The post-commit hook will catch the lessons." It sees commits, not the corrections,
  retries and dead ends that teach the most.
- ❌ "We'll consolidate at the end of the feature." Parallel sessions never end cleanly.
- ❌ Letting an unattended model push to a public knowledge base. Propose to a branch; a
  person publishes.
- ❌ Feeding raw transcripts to the model. Cost grows with history and secrets ride along.

## Sources

- Google SRE book, "Eliminating Toil": automate repetitive operational work rather than relying on people to remember it — https://sre.google/sre-book/eliminating-toil/
- Claude Code best practices (Anthropic): keep agent context small and curated — https://www.anthropic.com/engineering/claude-code-best-practices
