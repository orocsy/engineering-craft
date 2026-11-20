---
title: Mask secrets by key name, never by matching the value
type: pitfall
maturity: draft
impact: HIGH
impact-description: |
  A mask that recognises secrets by what their values look like misses every value in a
  shape it did not expect (quoted, multi-line, with spaces), and prints it in full into a
  chat, a log or a CI transcript. The key must then be rotated.
tags: secrets, env, logging, shell, setup
applies-to: |
  Inspecting an env file, `printenv`, a CI variable list or a provider's config while
  checking a setup or debugging, whenever the output lands somewhere others can read.
related-rules:
  - gh-secret-set-stdin
  - secret-existence-vs-exposure
historical-incidents:
  - "checking a payment-provider setup, a sed mask that matched only unquoted values printed two quoted sandbox secrets into the chat; both had to be rotated"
last-referenced: 2026-11-18
---

## The footgun

```bash
# ❌ masks by value shape: KEY=abc is masked, KEY="abc" and KEY='a b' are printed in full
sed -E 's/=[^"]+$/=<masked>/' .env
```

Values come quoted, single-quoted, exported, multi-line, or with an inline comment. A pattern
for the value has to anticipate every one of those shapes; it will not.

## The right ways

Print names, never values, and test presence without reading the value:

```bash
cut -d= -f1 .env                            # names only
sed -E 's/=.*/=<set>/' .env                 # everything after the first = is gone, whatever its shape
printenv | cut -d= -f1 | grep -E '^STRIPE_' # which variables exist
[ -n "${STRIPE_SECRET_KEY:-}" ] && echo "STRIPE_SECRET_KEY is set"
```

When you need to confirm WHICH secret is loaded, compare a short fingerprint, never the value:

```bash
printf %s "$STRIPE_SECRET_KEY" | shasum -a 256 | cut -c1-8
```

## Verification step

Run the mask on a line you made up in every shape (`A=plain`, `B="quoted"`, `C='with space'`,
`export D=x`) before running it on the real file. If any made-up value survives, the real ones
will too.

## If a secret was printed

Rotate it at the provider, update every place it is stored, and say so in the hand-off. Deleting
the message does not un-send it.

## Sources

- OWASP Secrets Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- OWASP Logging Cheat Sheet (data to exclude from logs): https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
