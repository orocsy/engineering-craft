# Implementation-Time Gates — Answer Before You Open the PR

Derived from **1,011 external-reviewer findings** (252 P1, 579 P2) across four
production repos. Each section is one recurring FAILURE CLASS, not one bug.

Two rules about how to use it, both learned the hard way:

1. **Every question names a concrete artifact.** "Did you think about races?" is not a
   question, it is a mood. "Point at the line that predicates the write on the pre-state"
   is a question — you either can or you cannot.
2. **The scope is every surface the change TOUCHES OR DEPENDS ON**, not the lines it adds.
   The single most expensive class in the corpus is *a control that landed on one path
   while its structural twin shipped without it*. Twins are never in the diff.

Where a class has an executable gate, **run the gate instead of answering the question** —
encoded-as-code beats encoded-as-prose, and the gate re-checks surfaces you did not touch.

---

## 1. Sibling twins — did you join a family?

*The highest-recurrence class in the corpus.*

- [ ] Does the thing you added belong to a FAMILY that already exists — another action
      behind the same router, another route serving the same data class, another handler
      verifying the same token class, another job writing the same target?
- [ ] For each existing family member: what invariants does it carry (atomic claim, auth
      re-anchor, `nosniff`, rate limit, tenant scope, pagination tiebreaker)? Name them.
- [ ] Does your new member carry each one — or is there a recorded reason it does not?
- [ ] Is the family **enumerated somewhere a machine can walk**, so the next person does
      not have to notice this?

> Gate: `family-registry.template.mjs` — enumerates every dispatchable member from its
> dispatch site and fails the build on any member with no recorded classification.

Rule: [exhaustive-registry-beats-diff-review](../categories/verification-integrity/rules/exhaustive-registry-beats-diff-review.md)

## 2. One-shot transitions — is the gate in the storage layer?

- [ ] Can two callers reach this code path at the same time? (Double-submit, retry,
      multi-tab, webhook redelivery — assume yes unless you can show otherwise.)
- [ ] Does the write predicate on the PRE-STATE (`updateMany({where:{id, status:'pending'}})`,
      atomic `inc` claim, `FOR UPDATE`), or does a JS `if` read it and an unpredicated
      `update` write it?
- [ ] **Match on shape, not vocabulary.** `pending → active`, `draft → published`,
      `finalize`/`complete`/`activate`/`settle` are one-shot transitions exactly as much as
      `consumedAt` is. A previous incident shipped precisely because the trigger list said
      "consumedAt" and the code said "status".
- [ ] Is there a `Promise.allSettled` race test asserting **exactly one** winner?

Rules: [single-use-token-consumption](../categories/concurrency-cas/rules/single-use-token-consumption.md) · [storage-gate-not-js](../categories/concurrency-cas/rules/storage-gate-not-js.md) · [race-test-contract](../categories/concurrency-cas/rules/race-test-contract.md)

## 3. Multi-store transitions — what is durable after a partial failure?

- [ ] This transition spans two stores that cannot commit together (object storage + a
      metadata row, DB + a payment provider, DB + a queue). Write the two orderings down.
- [ ] For EACH ordering, what state is durable if the process dies between them? Which of
      those states is inconsistent-but-recoverable, and which is inconsistent-and-invisible?
- [ ] Delete bytes before retiring the row, or retire the row before deleting bytes — and
      say why. (Bytes-first leaves a retryable row; row-first leaks bytes no cleanup can see.)
- [ ] Does the failure path COMPENSATE, or does it just return an error and leave the
      half-state? Every early `return`/`throw`/`process.exit` after a remote mutation is a
      candidate leak.
- [ ] If the compensating action also fails, is that logged loudly enough for an operator
      to find the orphan?

## 4. Parent/child async — can the parent commit while a child is still working?

- [ ] Does any child component do async work (upload, remote validation, geocode) and
      report results through a `value`/`onChange` contract?
- [ ] That contract has no "in flight" state. Where does the parent learn that work is
      pending — or does its Save button only know about its own request?
- [ ] Is there a test that starts an operation which never resolves and asserts Save is
      disabled?

> Gate: `async-child-busy-contract.template.mjs`

Rule: [controlled-input-hides-async-work](../categories/frontend-async-state/rules/controlled-input-hides-async-work.md)

## 5. Degraded mode — what happens when the script does not run?

- [ ] For every `<form>` you touched: does it declare `method`? (No `method` = GET = every
      field in the URL, in history, in the `Referer`, in access logs.)
- [ ] Is that behaviour DECLARED or INHERITED from a platform default?
- [ ] Would this surface exist in the HTML if hydration threw, the bundle 404'd, or a CSP
      change blocked the script? Those are the realistic paths into degraded mode — not a
      user with JS switched off.

> Gate: `form-degradation.template.mjs`

Rule: [form-without-method-submits-get](../categories/progressive-degradation/rules/form-without-method-submits-get.md)

## 6. Trust boundaries — parsed, or cast?

- [ ] Every `await res.json()`, `JSON.parse`, `localStorage.getItem`, webhook body: is it
      VALIDATED, or given a type with `as`?
- [ ] Does the client type declare any field the server does not actually send? Point at
      the server projection that produces each one.
- [ ] For every external value you branch on, can you quote the vendor/spec sentence that
      says it means what your branch assumes — and name the other things that produce it?

> Gate: `trust-boundary-decoding.template.mjs`

Rule: [parse-dont-cast-at-trust-boundaries](../categories/verification-integrity/rules/parse-dont-cast-at-trust-boundaries.md)

## 7. Presentation vs authorization — who answered the question?

- [ ] Is any entitlement, role, or capability rendered from a CLIENT-held or CACHED copy
      (a JWT claim, a cached role, an in-memory session)?
- [ ] If the server revoked it one second ago, what does the UI show, and for how long?
- [ ] Does the server re-derive the sensitive classification on every request, or does it
      trust what the client presented?

Rule: [server-rederives-sensitive-classification](../categories/auth-identity/rules/server-rederives-sensitive-classification.md)

## 8. Pipelines — is the deploy CAUSED by green, or merely correlated with it?

- [ ] Is the deploy job a causal descendant — same-workflow `needs:` chain, or
      `workflow_run` **plus** `if: conclusion == 'success'` — of the job that runs the tests?
- [ ] Two workflows on the same `on: push` are SIBLINGS. They start together; neither reads
      the other's verdict.
- [ ] Does the upstream workflow you chained to actually RUN the tests? (One repo chained
      to the image build; another to a workflow named "Test Branch Push" whose only step was
      an `echo`.)
- [ ] **On the trigger that actually ships**, list which verification steps execute. A smoke
      behind `workflow_dispatch` with a boolean input does not run on `push`.

> Gate: `pipeline-causality.template.mjs`

Rule: [deploy-must-be-causal-descendant-not-concurrent-sibling](../categories/deploy-delivery/rules/deploy-must-be-causal-descendant-not-concurrent-sibling.md)

## 9. Your checks — have you ever seen them fail?

- [ ] For each probe/assertion you added or relied on: write the sentence it licenses you
      to say, then point at the line that would fail if that sentence were false.
- [ ] Does the assertion bind to the SUBJECT (this call site, this request, this value) or
      merely to a TOKEN that appears somewhere in the file?
- [ ] Have you run it against a deliberately broken version? Use a **decoy** break — leave
      the searched-for token satisfiable elsewhere — not a deletion. Every check catches
      deletion; that is why blind checks feel trustworthy.
- [ ] Any test skipped? Then it carries `@skip-until <date>` or `@skip-when <environment>`,
      and in the environment that is supposed to provide the precondition it ASSERTS rather
      than skips.

> Gates: `probe-sensitivity.template.mjs` · `skip-policy.template.mjs`

Rules: [probe-must-fail-on-injected-defect](../categories/verification-integrity/rules/probe-must-fail-on-injected-defect.md) · [skip-is-a-decision-not-a-default](../categories/verification-integrity/rules/skip-is-a-decision-not-a-default.md)

## 10. Out-of-repo prerequisites — who creates them?

- [ ] Does correctness depend on something outside the repo — a DB index, a bucket CORS
      allowlist, a console-managed env var, a provisioned secret, a webhook endpoint
      registration?
- [ ] Is the repo's only record of it a comment or a doc line? Then nothing creates it and
      nothing asserts it exists.
- [ ] Is there a preflight that FAILS when it is absent, rather than code that degrades
      quietly?

## 11. Canonical docs — did the change make one of them false?

- [ ] Which documents/comments describe the behaviour you just changed? Name them.
- [ ] A doc marked canonical that has drifted is worse than no doc: later work treats it as
      ground truth. Update it in the same commit or delete the claim.

---

## Why this is a one-pass gate, not a review loop

Across the four repos in this corpus, the same classes recur *within* a single PR across
review rounds — a reviewer finds one instance, the fix lands, the next round finds the
twin. That is the signature of a class-level defect being handled instance-by-instance.
Answering these questions before the PR opens is what collapses the rounds; the executable
gates are what keep them collapsed after everyone has forgotten this file exists.
