---
title: Owner steps come from the live dashboard — click by click, one environment at a time
type: process
maturity: draft
impact: HIGH
impact-description: |
  When a setup step only the account owner can do is written from docs or memory,
  the owner meets an unexpected dialog, a missing column or a greyed-out setting
  halfway through, and the setup stalls or is done wrong in the live account.
tags: process, setup, owner-handoff, dashboards, third-party, secrets
applies-to: |
  Any time you hand the owner steps to do in a provider's web dashboard: payments,
  email, DNS, hosting, app stores, OAuth apps, cloud consoles.
related-rules:
  - post-merge-deploy-verification
historical-incidents:
  - "a live payment-provider setup: steps written from the docs missed a key-creation dialog that asks how the key will be used and a per-row permission column for connected accounts, mixed sandbox and live instructions, and discovered only at the end that the OAuth setting and the live client ID stay locked until the platform profile and live activation are finished"
  - "the same setup printed two sandbox secrets into the chat, which then had to be rotated"
last-referenced: 2026-11-18
---

## The rule

1. **Do every step an API or CLI allows yourself first.** The owner's list is only what a
   person must click (sign-in, terms, payment, approval, the few settings with no API).
2. **Read the real dashboard before writing a step.** Open it in a browser and look; page
   names, menu paths and field labels drift, and docs describe an older layout.
3. **Write every click.** Each field and the value to enter, each toggle and dropdown choice,
   each pop-up and confirmation, including dialogs that ask what a key is for and per-row
   permission columns. "Create a key with the right permissions" is not a step.
4. **One list per environment.** Sandbox/test and live are separate, self-contained lists, never
   interleaved and never "same as above but live".
5. **Name locks up front.** Before the first step, say which settings the provider keeps
   disabled and what unlocks them (account profile, identity verification, live activation),
   so the owner does those first instead of finding a greyed-out button at step nine.
6. **Secrets never travel through chat.** Hand them over with a secure handoff, and never print
   one while checking a setup; rotate any key that was shown.

## Why it happens

The agent knows the provider from documentation and earlier sessions, so it writes plausible
steps quickly. The owner, following them in a live account, is the first to see the actual
screens, at the worst moment to discover they differ.

## Check before you send the steps

- [ ] Every step was seen in the live dashboard this session (not recalled).
- [ ] No step says "configure", "set up" or "the usual settings" without the exact values.
- [ ] Sandbox and live are separate lists; each starts with its own sign-in or mode switch.
- [ ] Locks and their prerequisites are listed before step 1.
- [ ] No secret, account ID or personal email appears in the steps or the chat.

## Sources

- Google developer documentation style guide — Procedures (one action per step, say where the action happens, state prerequisites first): https://developers.google.com/style/procedures
- Microsoft Writing Style Guide — Writing step-by-step instructions: https://learn.microsoft.com/en-us/style-guide/procedures-instructions/writing-step-by-step-instructions
