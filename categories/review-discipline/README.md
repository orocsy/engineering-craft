# Review Discipline

**When this category bites**: a PR reaches "0 P1" in automated-review round 1, but rounds 2-5 keep digging deeper into the same code area. A "P2 deferred" in round 1 becomes a P1 in round 3. E2E green ≠ correctness.

**Source incidents**: 10+ rounds across several real PRs, including two that ran 5 and 4 sequential automated-review rounds respectively.

## Bedrock rule

**Automated-review / PR-bot rounds keep finding sibling concerns even after rounds 1-4 reach 0 P1.** Each round digs deeper into the same code area. Treating each round's findings as the "complete" set is a structural mistake — they're samples of an underlying class of issue.

## Rules

| Rule | Impact | Trigger |
|------|--------|---------|
| [round-cascade-and-deferred-p2](rules/round-cascade-and-deferred-p2.md) | HIGH | Any PR with ≥2 review rounds; any "P2 deferred" annotation; any post-E2E-green merge |

## Anti-patterns

- "Round 1 is clean of P1, ship it" — round 2 will find a P1 from a different angle
- "P2 deferred to follow-up PR" — rarely lands; ships as future P1
- "E2E green = correct" — E2E tests state, not state-transition combinatorics
- Commit-message hygiene of "fix: address N more review-round-K findings" is a smell — the fix should land in the original PR, not a follow-up
- Auto-applying every automated-review finding without verification — false positives accumulate as defensive cruft (see [push-back-on-reviews-when-verified](../workflow/rules/push-back-on-reviews-when-verified.md))

## Related

- [workflow/self-review-before-push](../workflow/rules/self-review-before-push.md) — local self-review BEFORE the automated reviewer
- [workflow/push-back-on-reviews-when-verified](../workflow/rules/push-back-on-reviews-when-verified.md) — fight back when finding is wrong
