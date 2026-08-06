# Mining external AI review findings into implementation-time gates

**Date**: 2026-08-06
**Corpus**: 1,011 inline findings from the `chatgpt-codex-connector` reviewer, spread over
152 PRs (of 231 enumerated) in four repos — nutribuddy 435, luxebook 357, coachflow 219,
channel 0 — plus channel's seven local `review-findings-*.md` rounds, its review-fix commit
bodies, and the 2026-08-06 external review of channel PR #6/#7.
**Severity mix**: 1 P0 · 305 P1 · 685 P2 · 19 P3.

**Goal**: stop paying for these findings in review rounds by converting them into defenses
that fire at implementation time.

Channel returning zero is itself a finding: `@codex review` was requested six times on
PR #6 and once on PR #5, and `pulls/N/comments`, `pulls/N/reviews` and the issue timeline
all return nothing. Whatever that reviewer produced for channel exists only outside
GitHub — which is why the 2026-08-06 round had to be supplied by hand, and why channel's
history had to be mined from local finding docs and commit bodies instead.

---

## The headline

**For most of these classes the catalog already contained the right rule, and the rule did
not fire.** The strongest evidence is not statistical — it is that several rules record
*this very incident* as their own `historical-incidents` entry and the class recurred
anyway:

- `concurrency-cas/cross-tx-cas-recompute` was **mined from** one of the SSI findings it
  later failed to prevent.
- `time-and-timezone/server-local-trap` (proven, shape-based `applies-to` covering "time
  formatting for scheduling") lists two of this corpus's timezone exemplars verbatim.
- `observability/analytics-lifecycle-and-containment` records "reset() fired during the
  auth `/me` loading window, splitting sessions across every hard refresh" — which is the
  exemplar, word for word.

A rule that has already been written *from* an incident, with a matching trigger, and whose
own text names the failure, is as strong as prose defenses get. It still did not stop the
recurrence. **Writing the rule and making it fire are different problems, and only the
first was ever solved.**

Where a rule existed, the recurring reasons it stayed silent were:

- **the trigger is keyed to vocabulary present in the diff** — `single-use-token-consumption`
  said `consumedAt`/`usedAt`/`spent`; the code said `status: pending → active`;
- **the scope is the diff, not the family the diff joins** — `status-set-creep` applies to
  "every `if (x.status !== …)` in the codebase", but every path *into* it runs through an
  INDEX keyword that must appear in the diff;
- **nothing executes it** — `server-local-trap` recommends a `TZ=UTC` / `TZ=Asia/Hong_Kong`
  test matrix that was never made a required check.

A **minority of classes were genuine gaps** — most visibly the "a check that isn't
checking" family (probe bound to a proxy, skip-instead-of-fail, `as T` at trust boundaries)
and the no-JS degradation class. At review time no rule anywhere required a probe to be
demonstrated failing against a broken fixture. The rules that now cover those are the ones
authored *today, in response to this corpus* — which is what a mining pass is for, and
which is exactly why they must not be cited as defenses that were available at the time.

> **On the numbers.** A first-pass attribution assigned each class one reason
> (8 × trigger-too-narrow, 4 × gate-asserted-wrong-thing, 2 × diff-scoped, 2 × prose-only,
> 1 × wrong-phase, 1 × no-rule). An adversarial forensics pass that re-read the committed
> catalog and `git log` **rewrote 16 of those 18 attributions** — several classes turned out
> to have a *better*-matching rule than the one cited, and at least four turned out to be
> genuine gaps rather than non-firing rules. Treat the per-class reason as indicative and
> the qualitative finding above as the robust one. Full verdicts:
> [`2026-08-06-adversarial-verdicts.json`](2026-08-06-adversarial-verdicts.json).

---

## Ranked classes

Recurrence is the de-duplicated count across all four repos. **Treat the numbers as
conservative lower bounds** — see *Method caveat* below — and the class boundaries as a
first cut: an adversarial pass challenged most of them (see *What the adversarial pass
found*). The ranking is stable enough to prioritise by; the class *names* are not yet
settled vocabulary.

| # | Class | Rec. | Repos | The question to answer before opening the PR | Defense |
|---|---|---:|---|---|---|
| 1 | **reachable-state-with-no-exit** — a state is reachable by construction but its exit was never implemented | 43 | c,l,n | Write the full truth table of the state tuple this branch switches on, including each dimension's loading/unknown/error value. Which rows have no destination? | Exhaustive `Record<Union, Handler>` + `never` check; table-driven test generated from the union |
| 2 | **name-resolves-differently-on-each-side** — a name is encoded twice, resolved by different machinery | 38 | c,l,n | For every name this change introduces or renames (env key, volume, image tag, bind path, secret ref, cookie domain, CORS origin), cite the file and line on the *consuming* side that resolves it | Repo-wide name-resolution contract script (extends `four-consumer-rule` past env vars) |
| 3 | **rule-lives-in-call-sites-not-in-the-type** — a domain rule enforced per call site, so new values and new writers escape it | 38 | c,l,n | You added an enum member / a second writer. List every guard, filter, badge map and side-effect path that must know — then say why the type doesn't carry the rule instead | Exhaustive-map lint + single-writer-per-transition AST assertion |
| 4 | **failure-path-decides-durability-without-classifying-the-failure** — the error path commits, acks or terminalizes without knowing which failure occurred | 36 | c,l,n,**ch** | For every `catch`/early return after a remote mutation: which failures land here, and is each one terminal, retryable, or ambiguous? What is durable if the process dies right here? | Ban bare catch-all → terminal transition; require a classified error union at durability decisions |
| 5 | **verification-bound-to-a-proxy-not-to-the-behavior** — the probe asserts something adjacent to its claim, so it can only false-PASS | 35 | c,l,n,**ch** | Write the sentence this probe licenses you to say, then point at the line that fails if that sentence is false | ✅ **`probe-sensitivity.template.mjs`** — decoy-mutation harness |
| 6 | **precondition-read-outside-the-write-it-guards** — the condition is checked by a prior SELECT while the write matches on primary key alone | 32 | c,l,n | Name the single row both concurrent paths WRITE to serialize this decision. If the answer is "we re-read inside a transaction", explain why SSI aborts | Predicate-in-write lint; barrier-based concurrency test template |
| 7 | **session-identity-spread-across-carriers-with-no-authority** — several carriers hold "who is signed in", none authoritative | 31 | c,l,n | Which store is authoritative? When a token arrives from any writer, is its SUBJECT validated against that store before persisting? | Multi-tab/multi-context Playwright matrix over the enumerated interleavings |
| 8 | **at-most-once-effect-with-no-single-winner-claim** — an effect that must happen once is guarded by a read, not a claim | 30 | c,l,n,**ch** | For each externally-visible effect: name the single storage operation that makes one caller the winner. If the answer is a prior read, say what stops the second caller | ✅ **`family-registry.template.mjs`** + shape-keyed `single-use-token-consumption` |
| 9 | **new-generation-introduced-without-retiring-or-backfilling-the-old** | 28 | c,l,n | What inventory of the predecessor exists, and can every existing row satisfy the new rule? | Migration-audit + dual-run preflight script |
| 10 | **boundary-contract-assumed-instead-of-derived** — each side re-encodes the contract; nothing verifies the wire | 27 | c,l,**ch** | Point at the server projection that produces every field your client type declares | ✅ **`trust-boundary-decoding.template.mjs`**; shared schema over parallel DTOs |
| 11 | **deferred-effect-re-derives-its-subject-instead-of-anchoring-it** | 25 | c,l | Does work executed later re-query a mutable parent, or use the id/terms captured at intent time? | *(no rule existed — the one genuine gap)* Anchor-at-intent rule + replay test |
| 12 | **third-party-and-framework-semantics-assumed-not-probed** | 24 | c,l,n | Quote the vendor sentence saying this value means what your branch assumes, and list the other causes that produce it | Recorded SDK/spec probe artifact per newly-branched-on field (extends `verify-sdk-surface` from *exists* to *means*) |
| 13 | **redaction-control-narrower-than-the-egress-surface** | 22 | c,l,**ch** | Enumerate every transport this SDK can open (replay, autocapture, breadcrumbs, profiling). For each, name the scrubber that covers it | Property-based test generating events from the vendor's payload schema |
| 14 | **pipeline-guarantees-declared-by-hand** | 21 | c,l,n,**ch** | Is the deploy job a causal descendant of the job that ran the tests for *this* SHA? | ✅ **`pipeline-causality.template.mjs`** |
| 15 | **a11y-contract-dropped-by-a-transition-or-an-adapter** | 21 | l,n,**ch** | After this subtree swap, where does focus land, and which node restores it? | RTL/axe focus-and-linkage assertion helper |
| 16 | **authoritative-doc-asserts-state-no-code-enforces** | 20 | l,n,**ch** | Which docs describe the behaviour you just changed? Update or delete the claim in this commit | Doc-assertion binding: canonical claims cite a test that enforces them |
| 17 | **not-yet-settled-value-read-as-authoritative** — a decision made from loading, transiently-null or stale-cached state | 18 | c,l,n,**ch** | Can this component commit while a child still has work in flight? | ✅ **`async-child-busy-contract.template.mjs`** |
| 18 | **ambient-default-used-where-an-explicit-authority-exists** — the call site reaches for the host default instead of the domain's authority | 17 | l,n | What does the platform do by default here, and did you *decide* that or *inherit* it? | ✅ **`form-degradation.template.mjs`** (the `<form>` case); ban-raw-API lints for TZ/design tokens |

`c`=coachflow · `l`=luxebook · `n`=nutribuddy · `ch`=channel. ✅ = a gate was built and
verified to fail on the real historical defect (see below).

Seventeen candidate classes were merged into these and two rejected; the full merge log,
with the reasoning for each, is in
[`2026-08-06-class-taxonomy.json`](2026-08-06-class-taxonomy.json) alongside every class's
exemplars. One rejection worth repeating: *"multi-tenant / auth bugs"* was rejected as a
**topic, not a mechanism**, and split by actual mechanism into classes 6 and 7.

---

## What was built, and the proof it fires

Eight executable gates. Each was run against the real repositories; each **fails on the
historical defect and passes on the corrected pattern**.

| Gate | Verified against | Result |
|---|---|---|
| `probe-sensitivity` | channel's `verify-cloudbase-sdk-contract.mjs` | Naive mutation (verb flipped) → **detected**. Decoy mutation (verb flipped *and* the searched-for token moved to an unrelated call site) → **probe still passed**. Reproduces the reported P1 mechanically. |
| `pipeline-causality` | 4 repos | channel: 1 ungated deploy · coachflow: 1 (chained to the *image build*, not the tests) · nutribuddy: 3 (chained to a workflow named "Test Branch Push" whose only step is an `echo`) · luxebook: **clean** (correctly chained 7-job graph) |
| `form-degradation` | 4 repos | **31 of 31** server-rendered forms declare no `method` — including luxebook's admin sign-in and forgot-password |
| `skip-policy` | channel | 8 unjustified skips, incl. `test.skip(!loginBody.ok, 'seeded member account unavailable')` — an alarm disarmed by the failure it watches for |
| `trust-boundary-decoding` | 4 repos | 38 unvalidated `as T` casts on remote/stored data |
| `async-child-busy-contract` | 4 repos | 2 components, both true positives; silent on synchronous controlled inputs |
| `family-registry` | channel | **27 dispatchable actions with no concurrency classification.** The external review found one. |
| `catalog-integrity` | this repo | Caught one rule I added with no README row, and 12 pre-existing rules with no frontmatter trigger |

### Two gates that first committed the defect they were written to catch

Worth recording, because it is the class's own lesson:

- `pipeline-causality` v1 used `run.includes('pnpm test')`, which matched
  `pnpm test:e2e:public` — it **passed the repo whose defect it was written to find**.
  Fixed by anchoring to whole commands.
- `pipeline-causality` v2 checked only direct `needs:` and reported **three false
  positives** on luxebook's correctly-chained pipeline. A gate that cries wolf gets
  switched off, which is how a repo ends up with no gate at all. Fixed by walking the
  `needs:` closure transitively and excluding deploy-word false friends
  (`prisma migrate deploy`).

Both were caught by running the gate against a *second* repo. One repo is not a test set.

---

## What the adversarial pass found

Three independent lenses attacked the taxonomy. None of them was allowed to answer "keep"
by default, and none of them did.

| Lens | Verdicts | What it was looking for |
|---|---|---|
| Distinctness & altitude | 6 keep · 3 rewrite · 9 split · **8 unnamed clusters** | Is this a mechanism or a topic? Would two classes be fixed by one defense? |
| Gate honesty | 6 keep · 1 merge · 8 rewrite · 3 split | Would the proposed check actually fail on the cited exemplar? |
| Trigger forensics | 1 keep · **16 rewrite** · 1 split | Does the named rule really say what the diagnosis claims, and would its trigger really not have fired? |

Three findings from it are worth acting on:

1. **The biggest class in the corpus is not in the table.** The distinctness lens named a
   cluster of ~40 nutribuddy findings the synthesis missed entirely: *a constraint is
   collected, validated and persisted, and each downstream decision independently decides
   whether to read it* — ranking, filtering, prompt construction, a second write path. The
   dropped value is an **allergy**. Three shapes, all observed: the callback type cannot
   carry it (`onGuestReady: () => void`), the consumer reads a coarser proxy (a card-wide
   `allergySafe` boolean, set `true` on every seed row, while the entered allergen text is
   never compared to ingredients), and a breakpoint swap unmounts the component that *owns*
   the draft mid-entry. It would rank #1 or #2. **Now written up** as
   [`grep-for-siblings/collected-constraint-must-reach-every-consumer`](../categories/grep-for-siblings/rules/collected-constraint-must-reach-every-consumer.md).
   It was missed because nutribuddy's minings were in the truncated part of the
   synthesizer's input — the caveat below has a concrete cost.

2. **Several classes are attractors, not mechanisms.** `reachable-state-with-no-exit`
   (recurrence 43) draws its size from absorbing anything describable as "no path forward",
   and its own gate proposal splinters into four unrelated checks — which is the operational
   definition of a topic. Both lenses flagged it independently. Same for
   `third-party-and-framework-semantics-assumed-not-probed`: *source* is not a mechanism.

3. **Some proposed gates would not fail on their own exemplar.** The gate-honesty lens
   found the headline check for `rule-lives-in-call-sites-not-in-the-type`
   (`Record<Status, T>` + `never`) cannot catch its headline exemplar, because that defect
   is not a missing enum mention. Several other proposals are repo-wide greps that "will be
   turned off in a week" — which is this corpus's own failure class applied to its remedies.

**The eight gates below are unaffected by all of this**, because each was built from a
specific defect and verified against it, not derived from a class name. The classes still
needing splitting affect *which gates to build next*, not the ones already proven.

---

## The trigger-scope change

This is the durable output. Three doctrine changes are now in the catalog:

1. **Sibling rules must fire on ADDITION, not only on change.** Every existing sibling
   rule (`security-literal-grep`, `api-rename-cross-cut-grep`) triggers on a *subtractive*
   edit — "when you remove a literal", "when you rename a function". None fires when you
   **add a new member to a family whose existing members carry an invariant**. That is the
   exact gap the channel finalize handler fell through. New rule:
   `verification-integrity/exhaustive-registry-beats-diff-review`.

2. **Scope is every surface the change TOUCHES OR DEPENDS ON.** Recorded in `INDEX.md`
   above the trigger table, and in the `G4` and `Pre-push` rows of the by-phase table.

3. **Match on SHAPE, not vocabulary, wherever a shape exists.**
   `single-use-token-consumption`'s `applies-to` was rewritten from a field-name list to a
   shape: *"a row may make transition T at most once, two callers can reach the code that
   performs T, and the write is not predicated on the pre-state"* — with the observed
   spellings (`pending→active`, `draft→published`, `finalize`/`complete`/`activate`) listed
   as instances rather than as the definition.

---

## Before / after: why the finalize claim was missed

The case the exercise was built around. Three defenses existed; each missed differently.

| Defense | Its stated trigger | Why it stayed silent |
|---|---|---|
| `concurrency-cas/storage-gate-not-js` | *"Any code shaped like `const x = await read(); if (x.flag) throw; await update(x, …)`"* | The `applies-to` matched the defective code **verbatim** — but it lives *inside* the rule file, and the only mechanical routing surface (INDEX's trigger table) is keyed on `forgot-password, otp, jwt, session, tokenVersion`. To find the rule you had to already suspect it. |
| `concurrency-cas/single-use-token-consumption` | *"Any `consumedAt`/`usedAt`/`spent` flag"* | The transition was spelled as a status enum. Same semantics, zero lexical overlap. |
| `channel/docs/ENGINEERING_CRAFT.md` § *"CAS claim before destructive validation"* | prose in a repo doc | Correct, specific, and it cited the very sibling that had the claim. Nothing forces you to open a doc while writing a handler. |

**After**: the `family-registry` gate enumerates all 27 dispatchable actions from the
router on every build and demands a `claimed`/`unclaimed` decision for each — including
handlers no diff touched. The trigger is now a surface the machine walks, not a word a
human must recognise.

### Live status on `channel@origin/main` (`5c14193`)

Verified with the gates, not from the review text:

| Reviewed defect | Status |
|---|---|
| `abandonUpload` partial deletion | ✅ **fixed** — owner lock, re-read under lock, storage-first delete, row left retryable on failure |
| `completeUpload` single-winner claim | ❌ **still live** — `if (doc.status !== 'pending') return CONFLICT` at `handler.ts:2077`, unpredicated `updateDoc(status:'active')` at `:2140`. `updateDoc` has no predicate parameter, so the only atomic primitive available is `incrementField` — exactly what the sibling `verifyAndClaimOemUpload` uses |
| SDK contract probe blind to the decoy | ❌ still live (`containsAll` whole-file match) |
| Admin Save races child uploads | ❌ still live (`ImageManager` props: `value`/`onChange`/`maxItems`/`inputId` — no busy channel) |
| No-JS form GET | ❌ still live (`ProjectForm.astro:42`, no `method`) |
| Deploy not causally gated on CI | ❌ still live (`deploy-test.yml` is a `push` sibling of `ci.yml`; runs neither `pnpm test` nor `verify:cloudbase-sdk`) |
| Skip-instead-of-fail smokes | ❌ still live (8 sites) |
| Unvalidated JSON casts | ❌ still live (5 sites) |

These may be deliberate deferrals; the point of recording them is that a gate re-detects
them on every build instead of waiting for the next external round.

---

## Catalog changes

- **New category `verification-integrity`** (4 rules) — probe-must-fail-on-injected-defect ·
  exhaustive-registry-beats-diff-review · skip-is-a-decision-not-a-default ·
  parse-dont-cast-at-trust-boundaries
- **New category `progressive-degradation`** (1 rule) — form-without-method-submits-get
- **New rules** — `deploy-delivery/deploy-must-be-causal-descendant-not-concurrent-sibling` ·
  `frontend-async-state/controlled-input-hides-async-work`
- **Refined** — `concurrency-cas/single-use-token-consumption` (shape trigger + the
  status-enum example) and its category README trigger/anti-patterns
- **New checklist** — `checklists/impl-time-gates.md`, 11 sections, every question naming a
  concrete artifact
- **8 new templates** — the gates above
- **INDEX.md** — trigger-scope doctrine, 9 new trigger rows, refreshed counts. The rule
  count (66) was accurate before this pass; the category count said 18 against 19 on disk —
  `time-and-timezone` is marked *"counted under process"* in the statistics block but is not
  actually counted in any row. Now 21 categories / 73 rules.
- **Plugin** — `cross-file-reasoning/FAILURE_MODES.md` Index listed 10 of 13 modes; modes
  11–13 had been appended without index rows and were unreachable. Fixed, with a note that
  index completeness is load-bearing.

---

## Method caveat

The synthesis step was handed the eleven minings as JSON truncated at 220 KB — my error —
which cut off part of the input. The synthesizer detected this, went back to the corpus
files on disk, and reconstructed the missing slices from finding titles, flagging that the
recurrence counts for part of luxebook and all of nutribuddy are therefore **conservative
lower bounds** rather than exact counts. The class *taxonomy* is grounded in the full
corpus on disk; the *numbers* are approximate. Re-running the merge with a chunked input
would tighten them, and would not be expected to change the ranking materially.

## Open items

Ranked by what would return the most next:

1. **Re-run the merge on a chunked input** and fold in the 8 + 5 + 4 clusters the lenses
   named as missing. The constraint-threading class is written up; the rest are not.
2. **Split the attractors** — `reachable-state-with-no-exit`,
   `third-party-and-framework-semantics-assumed-not-probed`,
   `boundary-contract-assumed-instead-of-derived` — before building gates from them. A gate
   built from a topic inherits the topic's vagueness.
3. **Make `server-local-trap` executable.** It is a proven rule that records two of this
   corpus's exemplars as its own incidents and recommends a `TZ=UTC` / `TZ=Asia/Hong_Kong`
   test matrix that nothing runs. Turning that recommendation into a required check is the
   cheapest large win available, because the analysis is already done.
4. 12 `deploy-delivery` rules carry no YAML frontmatter, so they have no machine-readable
   `applies-to` trigger and are reachable only through their README row. `catalog-integrity`
   reports them as warnings; promoting to `--strict-frontmatter` requires backfilling them.
5. Wiring the gates into each repo's CI is a separate, per-repo change and **was not made** —
   the gates currently live here as templates. The channel findings in the table above are
   therefore still only *detected*, not *guarded*.
6. The remaining classes have gate designs but no implementations; the eight built here
   cover the classes with the sharpest anchors.
