---
title: A Flake That Only Happens on CI Is Measured on CI — Then the Fix Is A/B'd There
type: pitfall
maturity: proven
last-referenced: 2026-11-12
impact: HIGH
impact-description: |
  A browser test fails on one CI run in six and never anywhere else. Code reading and
  local reproduction each produce a confident, wrong explanation; the first "obvious" fix
  changes nothing. Days go to guesses and unrelated pull requests stay red. Looping the
  real CI command on CI with a few cheap probes names the cause in about an hour.
tags: flaky-tests, ci, playwright, webkit, core-dump, disk-stall, a-b-verification, diagnosis
applies-to: |
  Any test that fails intermittently on CI and passes on rerun, locally and in a
  container; any timeout whose siblings ran at normal speed; any "fix" for such a
  failure that has not been run next to an unfixed control.
related-rules:
  - probe-must-fail-on-injected-defect
  - budget-against-the-measured-floor
  - selector-coupling-and-blast-radius
historical-incidents:
  - browser unit test timed out 17 of 99 CI runs; a crashed browser helper's core dump stalled the runner's disk for 20 s while the test's in-process API did synchronous file writes
  - `ulimit -c 0` chosen as the fix; the runner's piped core_pattern ignores the limit, three dumps were still written; only a side-by-side CI run showed it
  - a local container reproduced the same timeout text through a different mechanism (dev-server full reload) caused by the investigator's own scratch files in the watched tree
  - the guard was added to one workflow while four others, one running the same tests, had the same exposure
---

## Why this matters

A CI-only flake is usually not in the test or the product. It is in what surrounds
them on the runner: another process, the disk, the scheduler, a system service. None
of that exists on a laptop, so local loops pass forever and every theory built from
reading code is untested.

The incident behind this rule had four wrong turns, each plausible:

1. **The error text pointed at the wrong layer.** WebKit printed
   `… due to access control checks`. That is its message for any fetch cancelled by a
   navigation, not a CORS finding. The request was same-origin.
2. **"Only one browser engine fails" pointed at engine-specific logic.** The engine
   that failed simply ran second and was in the way when the stall arrived.
3. **A local reproduction matched the error text.** It was a different failure, caused
   by the investigation writing scratch files into a directory the dev server watched.
4. **The textbook fix did nothing.** The setting it changed was ignored on that
   platform.

What ended it was measurement in the place where it fails.

## Required reflexes

### Read the attempt that failed, not the rerun

CI tooling shows the latest attempt by default, which is the one that passed. Fetch
the failed attempt's log by attempt number and job id. From it: which test failed
*first* (later ones are often followers sharing state), how long its siblings took,
and whether another test process was alive beside it.

### Stop local reproduction after two or three clean loops

If the real command passes locally a few times, the cause is probably not something a
laptop has. Move to CI instead of looping for hours. Keep local runs for logic errors.

### Loop the real command on CI, with the same parallelism

Push a throwaway branch carrying one workflow that triggers only on that branch and
loops the exact CI command several times across several parallel jobs. Do not run the
failing file alone: here 0 of 20 solo runs failed, against 17 of 99 with its usual
neighbour. Size the experiment to the failure rate; a 1-in-6 failure needs dozens of
runs per arm.

### Let probes pick the layer before forming a theory

Three cheap probes separate the common causes:

```ts
// 1. Around each request the test serves: when it arrived, when the handler returned.
note(`${label} routed`); /* … */ note(`${label} handled after ${ms}ms`);

// 2. Once a second, in the slow process: running, waiting for a CPU, or blocked?
const [onCpu, runDelay] = readFileSync('/proc/self/schedstat', 'utf8').split(' ').map(Number);
const io = /some avg10=([0-9.]+)/.exec(readFileSync('/proc/pressure/io', 'utf8'))?.[1];

// 3. Navigations and dev-server messages the test did not ask for.
page.on('framenavigated', (f) => note(`navigated ${f.url()}`));
```

| The slow window shows | It is | Next |
|---|---|---|
| time on CPU near 100 % | computing | CPU profile |
| time waiting for a CPU high | CPU contention | process list names the hog |
| both low, I/O pressure rising | blocked on disk | `vmstat` write rate, then `fatrace -f W` names the writer |
| a navigation nobody asked for | the page reloaded | find who sent the reload |
| requests fast, element missing | product or test logic | dump the DOM at the timeout |

A CPU profile alone misleads in the blocked case: a stopped thread is sampled wherever
it stopped, so the profile looks like ordinary code.

### A/B every fix in the same loop

```yaml
# ❌ Fix applied everywhere, "it passed 10 times" — at a 1-in-6 rate that proves little,
#    and nothing shows the fix did what you think.
# ✅ Same loop, two arms, plus a direct measurement of the thing the fix removes.
matrix:
  arm: [unchanged, candidate]
```

Count the mechanism (dumps written, reloads sent, slowest handler), not only pass/fail.

### Keep scratch files out of anything a watcher under test can see

Copies of a test, probe files and logs go in a temp directory outside the project
tree. A dev server or file watcher that the test starts will react to them.

### Apply the guard to every sibling, and test for it

A runner-level guard added to one workflow leaves every other workflow with the same
exposure unprotected. Add it to all of them and write one check that walks every
workflow file, so a new one cannot omit it.

## Write it down as a router

Record the result where the next investigator starts, shaped as "what the log shows →
likely cause → how to confirm → what to do", with the misleading signals listed
separately. A narrative of the investigation is not usable under pressure; a symptom
table is.

## Related

- [probe-must-fail-on-injected-defect](../../verification-integrity/rules/probe-must-fail-on-injected-defect.md) — a fix, like a probe, is unproven until you have seen the unfixed case fail beside it
- [budget-against-the-measured-floor](../../verification-integrity/rules/budget-against-the-measured-floor.md) — timeouts sized from measurements, not guesses
