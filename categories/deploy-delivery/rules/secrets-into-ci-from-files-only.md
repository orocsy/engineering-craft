# Secrets enter CI from files/stdin only — and know the agent-session boundary

**Category**: deploy-delivery
**First seen**: 2026-05 in `luxebook` (the `"-"` scar) · agent boundary mapped 2026-08-01 in `coachflow`
**Risk**: P1 — silently corrupted secrets; hours lost to a mode problem misdiagnosed as a command problem

## The Lesson

`gh secret set NAME -b "$VALUE"` invites shell-quoting corruption — LuxeBook
once set 10 secrets to the literal string `"-"`. Always `gh secret set NAME < file`
or pipe via stdin; never inline. Separately: agent sessions have a credential
boundary — auto-mode safety layers allow secrets *used in place* (a script
reading `.env` to call the vendor's API) but deny *moving* them to any new store
(host, snippet file, CI secret store), regardless of allow-rules. That is a
permission-MODE property: after ~2 denials of one shape-class, stop iterating
shapes and name the mode fix (prompting/unrestricted session) — the exact same
command then succeeds verbatim.

## Why It Happens

Quoting bugs are invisible in green output; and an agent's denial messages look
like command errors, so the session burns attempts on rewording instead of
naming the actual lever.

## The Fix

```bash
# ❌ Wrong — shell quoting can corrupt the value silently
gh secret set COACHFLOW_ENV -b "$(cat coachflow.env)"

# ✅ Right — file/stdin, value never touches a command line
gh secret set COACHFLOW_ENV < coachflow.env
ssh box 'cat ~/app/.env' | gh secret set COACHFLOW_ENV
```

## Examples

- 2026-05 (`luxebook`) — 10 secrets became the literal string `"-"`; encoded in the
  CoachFlow runbook as the file/stdin-only rule.
- 2026-08-01 (`coachflow`) — 7 denial shapes in auto mode, then the identical
  `gh secret set` calls succeeded seconds after the user switched permission mode;
  boundary documented in the deploy runbook step 6 so no session rediscovers it.

## See also

- `tooling-footguns` owns the original `gh secret set --body -` CLI-behavior scar;
  this rule is its delivery-context form plus the agent-session boundary.
