---
title: In zsh, `for x in $list` Doesn't Split and `path` Is $PATH — Checks Written That Way Silently Lie
last-referenced: 2026-11-12
maturity: draft
type: pitfall
impact: HIGH
impact-description: |
  A post-deploy check looped over a space-separated list of chunk URLs with
  `for js in $list` and grepped each for the new code. In zsh the loop ran once with
  the whole list as one URL, fetched nothing, and reported "new code not found". A
  second check used `for path in …`, which overwrote zsh's `$path` array (tied to
  $PATH), so `curl` and `tr` became "command not found" mid-loop. Both looked like a
  failed deploy; the deploy was fine.
tags: zsh, bash, shell, word-splitting, PATH, verification, footgun
applies-to: |
  Any shell loop or check run in zsh (macOS's default shell), especially verification
  scripts whose "nothing found" result you'll act on.
related-rules:
  - probe-must-fail-on-injected-defect (verification-integrity)
historical-incidents:
  - a real incident (November 2026): two release checks reported missing code because of zsh word-splitting and a `path` loop variable
---

## The footgun

zsh does not word-split unquoted parameter expansions (bash does):

```zsh
list="a.js b.js c.js"
for f in $list; do echo "$f"; done   # zsh: ONE iteration, f="a.js b.js c.js"
```

zsh also ties lowercase `path` to `PATH` (likewise `cdpath`, `fpath`, `manpath`):

```zsh
for path in /v1/a /v1/b; do curl -s "$host$path"; done   # PATH is now "/v1/b": curl not found
```

## The right ways

```zsh
for f in ${=list}; do …; done      # explicit split in zsh
for f in "${(@f)list}"; do …; done  # split on newlines
for route in /v1/a /v1/b; do …; done  # never name a variable path, cdpath, fpath, manpath
```

Or write the check in Python (or `bash -c` with a shebang) when the result matters.

## Verification step

Before trusting "not found", make the same check find something that is certainly there
(a positive control). A loop that never ran can't find anything, so "not found" proves
nothing until the control passes.
