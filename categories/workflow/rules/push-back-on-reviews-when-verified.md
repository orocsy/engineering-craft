---
title: Push Back on Reviews After Serious Investigation; Don't Auto-Fix False Positives
last-referenced: 2026-05-12
maturity: verified
type: guideline
impact: HIGH
impact-description: |
  Codex/PR-bots produce some false positives. Auto-fixing every finding accumulates
  code rot and wastes time. Test the external dependency's actual behavior, then fight
  back with evidence if the finding is wrong.
tags: workflow, review, codex, false-positive, evidence
applies-to: |
  Every Codex/PR-bot finding that, after a quick read, doesn't match your understanding
  of the system.
related-rules:
  - self-review-before-push
historical-incidents:
  - PR#37 (Codex claimed Stripe cancel cascade; direct API tests disproved it)
---

## The pattern

Codex finding: "calling `subscription.cancel()` cascades to the customer's other subs"

Your read: "doesn't match the Stripe docs I just checked."

Two paths:

**Path A — auto-fix to be safe.** Costs 30 minutes, ships defensive code that's
unnecessary, accumulates as `// added per Codex review` cruft.

**Path B — verify with evidence.** Spend 10 minutes writing a direct test against the
Stripe sandbox. If the finding is wrong, push back in the PR thread with the test
output. Codex (or the human reviewer) accepts the evidence; the bug isn't fixed
because there's no bug.

Path B is the right default for findings that look wrong. PR#37 had exactly this —
Codex's cascade claim was disproved by a 5-line direct API call test, and the proposed
"fix" would have introduced new bugs.

## The discipline

When you read a finding that doesn't match your model:

1. **Don't reply yet.** Don't auto-fix.
2. **Test the underlying behavior.** Write the smallest test that proves or disproves the
   claim. Use the real external service (sandbox), not a mock — mocks could agree with
   the wrong assumption.
3. **If the finding is right**: accept gracefully, fix.
4. **If the finding is wrong**: reply in the PR thread with the test code, the actual
   output, and a link to authoritative docs. Stand your ground.

Never:
- Auto-fix without verifying
- Reply "you're wrong" without evidence
- Accept the finding to "move faster" — it's slower in aggregate (rot accumulates)

## Format for push-back

```markdown
> [Codex finding]: calling `subscription.cancel()` cascades to all customer subs

Tested with [sandbox script](link), finding does not reproduce:

```
$ node test-cancel.js
Customer cus_xxx has subs: [sub_a, sub_b]
Cancelling sub_a only...
Customer cus_xxx subs after: [sub_b] (sub_a status: canceled)
```

Stripe docs: https://stripe.com/docs/api/subscriptions/cancel
> "Cancels a customer's subscription immediately. The customer will not be charged again
> for the subscription. **Other subscriptions are not affected.**"

Closing as not-applicable.
```

The reviewer (Codex or human) sees the evidence and either accepts or refines their
claim with new info. Either way, the conversation moves forward on facts.

## When the finding is partially right

Sometimes Codex catches a real bug but with a wrong proposed fix. In that case:
- Acknowledge the bug
- Reject the proposed fix with reasoning
- Propose the right fix
- Apply it

Don't blindly take the proposed fix.

## Anti-patterns

- Reply "you're wrong" with no evidence — looks defensive, doesn't help anyone
- Accept and silently apply a wrong fix — accumulates rot
- "Codex is right, I must be wrong" — Codex is a tool, has false positives; trust your
  evidence
- Argue without testing first — you might be the one who's wrong
