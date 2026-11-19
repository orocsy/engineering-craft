---
title: A Constraint You Collect Must Be Threaded to Every Decision That Must Honour It
last-referenced: 2026-08-06
maturity: proven
type: guideline
impact: CRITICAL
impact-description: |
  A value is captured, validated and persisted at one stage, and then every downstream
  decision — ranking, filtering, prompt construction, a second write path, a re-render —
  independently decides whether to read it. Each omission is invisible: the collecting
  screen works, the value is in the store, and the feature "has" the constraint. It is
  simply absent from the computation. In the corpus the dropped value was an allergy.
tags: data-flow, constraints, safety, threading, plumbing, consumers, dto
applies-to: |
  Any value collected from a user or an upstream system that must CONSTRAIN later
  behaviour rather than merely be displayed: allergies and dietary restrictions, accessible
  seating, tenant scope, consent flags, locale, currency, age gates, quiet hours,
  do-not-contact, feature entitlements, safety limits.
related-rules:
  - four-consumer-rule
  - exhaustive-registry-beats-diff-review
  - payload-shape-drift-against-strict-dto
historical-incidents:
  - "a real review round: `LandingExperienceProps.onGuestReady` stayed `() => void`, so the
    collected draft never reached the caller; `requestCards()` sent no preferences. A guest
    could enter allergy, dietary and mood data, click through, and receive generic cards."
  - "the same feature: the headline promised every suggestion stayed inside the stated
    allergen boundary, while the enforcement path checked only a card-wide `allergySafe`
    boolean and never compared the entered allergen text against card ingredients — and
    every seed card set that flag true."
  - "the same feature: crossing the 1024px breakpoint swapped the subtree root, unmounting
    the component that OWNED the draft, silently resetting entered allergies mid-setup."
  - ~40 findings in one repo shared this mechanism, making it the largest single cluster
    in a 1,011-finding corpus.
---

## Why every instance looks like a small bug

Because each one is. The collecting UI works. The value is validated. It is in the store.
What is missing is an *edge* — from the value to one consumer — and an absent edge has no
code to review. You cannot see it in the diff, because it is not there.

That is also why fixing instances does not converge: the reviewer finds "carry preferences
into card selection", you fix it, and the next round finds "carry preferences into the
follow-up prompt", then "re-check safety when recording a swipe", then "apply restrictions
before loading cards". Each fix is correct and the class is untouched.

## Incorrect — the three shapes, all observed

```typescript
// ❌ 1. The callback type cannot carry it. The value dies at the boundary.
interface LandingExperienceProps { onGuestReady: () => void }        // no draft parameter
// …so requestCards() below simply sends nothing.

// ❌ 2. The consumer reads a COARSER proxy than the constraint.
const safe = card.constraintFlags.allergySafe;    // card-wide boolean, set true on every seed row
// the actual entered allergen text is never compared against ingredients

// ❌ 3. The owner of the value is unmounted by a presentation change.
{isDesktop ? <section><GuestStartScreen/></section>
           : <BottomSheet><GuestStartScreen/></BottomSheet>}
// crossing the breakpoint remounts the component that OWNS the draft → entered allergies reset
```

## Correct

Make the constraint a **typed decision input that every consumer must accept**, so an
omission is a compile error rather than a silent absence:

```typescript
// ✅ One object, required by every decision that must honour it.
interface DecisionInputs {
  readonly restrictions: Restrictions;    // required — not optional, not defaulted
  readonly viewer: Viewer;
}

function rankCards(cards: Card[], inputs: DecisionInputs): Card[]
function buildPrompt(turn: Turn, inputs: DecisionInputs): Prompt
function recordSwipe(cardId: string, inputs: DecisionInputs): Promise<void>
```

Three properties do the work:

1. **Required, not optional.** `restrictions?: Restrictions` re-opens the hole — every
   consumer silently defaults to "none". A missing argument must not compile.
2. **No defaulting at the boundary.** `restrictions ?? EMPTY` converts "nobody threaded it"
   into "the user has no allergies", which is the dangerous direction. If it can be absent,
   the type is `Restrictions | Unknown` and `Unknown` must be handled explicitly.
3. **Lift ownership above every switch that can remount.** A value the user is still
   entering must not be owned by a component a breakpoint, tab, or route change can unmount.

## Do not let a promise outrun the enforcement

The second incident is the one worth internalising: the copy said *"every suggestion stays
inside your allergen boundary"* while enforcement was a coarse flag. **A user-facing
assurance is a specification.** If the enforcement is coarser than the promise, either
sharpen the enforcement or weaken the words — shipping the strong claim over the weak
filter is the failure, not merely the weak filter.

## Tests

The assertion that actually catches this class is *output varies with the constraint* —
not "the function accepts the parameter":

```typescript
it.each(CONSUMERS)('%s output changes when the restriction changes', async (consume) => {
  const withNuts = await consume(fixture, inputs({ restrictions: none }));
  const without  = await consume(fixture, inputs({ restrictions: { allergens: ['peanut'] } }));
  expect(without).not.toEqual(withNuts);          // ← an ignored constraint fails here
});

it('a card containing an excluded allergen never reaches the deck', async () => {
  const deck = await buildDeck(cards, inputs({ restrictions: { allergens: ['peanut'] } }));
  expect(deck.every((c) => !c.ingredients.includes('peanut'))).toBe(true);
});

it('the draft survives crossing the desktop breakpoint mid-entry', async () => {
  await enterAllergy('shellfish');
  await resizeTo(1280);
  expect(await readAllergyField()).toBe('shellfish');
});
```

Enumerate `CONSUMERS` from the module that owns the decision, so a newly added consumer
joins the test list by construction — see
[exhaustive-registry-beats-diff-review](../../verification-integrity/rules/exhaustive-registry-beats-diff-review.md).

## See also

- [four-consumer-rule](../../config-drift/rules/four-consumer-rule.md) — the same counting discipline for env vars
