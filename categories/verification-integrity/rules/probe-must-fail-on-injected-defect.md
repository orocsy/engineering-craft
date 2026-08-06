---
title: A Probe You Have Never Seen Fail Is Not a Probe
last-referenced: 2026-08-06
maturity: proven
type: guideline
impact: CRITICAL
impact-description: |
  A contract probe that greps a whole FILE for a token cannot distinguish "the call site
  under test does X" from "some other call site in the same file does X". It reports PASS
  for a reason unrelated to its own claim — and because it is green, it is trusted more
  than no check at all would be. A wrong probe is worse than a missing one.
tags: testing, contract-probe, ci, mutation-testing, false-green, verification
applies-to: |
  Every standing check whose assertion is a substring/regex search over source, config,
  or built output: `verify-*` scripts, "assert the bundle contains X" smokes, grep-based
  security scans, snapshot assertions on serialised text, and any test whose failure you
  have never actually observed.
related-rules:
  - skip-is-a-decision-not-a-default
  - exhaustive-registry-beats-diff-review
  - regression-test-the-no-op
historical-incidents:
  - a real incident: an SDK upload-contract probe asserted the client used the SDK-required
    verb by searching the mapper file for `method: 'POST'`. The upload request had been
    changed to the wrong verb; the search was satisfied by a `method: 'POST'` occurring in
    an unrelated request in the same file. The probe stayed green through the whole review.
---

## The pattern

A probe makes a CLAIM ("the upload request uses the verb the SDK requires") and an
ASSERTION (`fileText.includes("method: 'POST'")`). Nothing binds them together. The
assertion is satisfiable by any occurrence anywhere in the file — including one the
claim says nothing about, including one added *by the very change that broke the claim*.

The failure is self-concealing. A probe that has only ever been observed passing gives
no evidence about what it does when the thing it guards is broken, and "it passed" is
read by everyone downstream as "it was checked".

## Incorrect

```javascript
// ❌ The needle can be satisfied by ANY occurrence in the file.
const mapper = readFileSync('packages/media-storage/src/cloudbase.ts', 'utf8');
requireCheck(
  containsAll(mapper, ["method: 'POST'", 'formFields', 'Signature']),
  'media-storage maps upload metadata to POST form credentials',
);
```

The upload function switches to the wrong verb; a `method: 'POST'` string still exists
somewhere in the file (a different request, a comment, a test fixture); the check passes.

## Correct — two independent moves, both required

**1. Anchor the assertion to the construct under test**, not the file that contains it.
Extract the specific function/route/request and assert against that slice, and assert the
NEGATIVE too (the wrong verb must not appear inside the slice).

```javascript
// ✅ Scope first, then assert — and assert the negative.
const uploadFn = extractFunction(mapper, 'getUploadCredential');   // slice, not file
requireCheck(/method:\s*'POST'/.test(uploadFn), 'upload credential uses POST');
requireCheck(!/method:\s*'PUT'/.test(uploadFn), 'upload credential does not use PUT');
```

**2. Prove the probe fails on the defect it claims to catch.** Anchoring is a promise;
mutation is the evidence. For each probe, keep at least one DECOY mutation: break the
real call site *and* leave the needle satisfiable elsewhere. Then require a non-zero exit.

```javascript
// ✅ Meta-gate, run in CI alongside the probes themselves.
{ "probes": [{
    "name": "sdk-upload-contract",
    "command": "node scripts/verify-sdk-contract.mjs",
    "mutations": [{
      "name": "decoy: real call site broken, needle moved to an unrelated call site",
      "file": "packages/media-storage/src/cloudbase.ts",
      "edits": [
        { "find": "method: 'POST',",   "replace": "method: 'PUT',", "count": 1 },
        { "find": "async deleteObject(", "replace": "/* method: 'POST', */ async deleteObject(", "count": 1 }
      ]
    }]
}] }
```

The naive mutation (delete the line) is not enough — every probe catches that, which is
exactly why teams believe blind probes work. The decoy mutation is the one that
discriminates.

## The tell, in review

Ask the author: **"write the sentence this probe licenses you to say, then point at the
line that would fail if that sentence were false."** If the answer is a whole-file
search, the probe is asserting the presence of a token, not the identity of the subject.

## Tests

```javascript
it('the contract probe fails when the guarded call site is broken', async () => {
  await withMutatedFile(MAPPER, [{ find: "method: 'POST',", replace: "method: 'PUT'," }], async () => {
    await expect(runProbe()).rejects.toMatchObject({ status: 1 });
  });
});

it('the contract probe fails even when the needle survives elsewhere in the file', async () => {
  await withMutatedFile(MAPPER, [
    { find: "method: 'POST',", replace: "method: 'PUT'," },
    { find: 'async deleteObject(', replace: "/* method: 'POST', */ async deleteObject(" },
  ], async () => {
    await expect(runProbe()).rejects.toMatchObject({ status: 1 });   // ← the discriminating case
  });
});
```

## Counter-case — a flake fix can neutralise a probe that used to work

The dangerous edit is not always to the code under test. A browser assertion proved that
pointer movement never rescales an image: it sampled the element, moved the pointer across
it, sampled again, and compared. It caught a real hover-zoom.

To fix an unrelated scroll-timing flake, the pointer-entry call was moved BEFORE the
baseline sample. Both snapshots now carried the hover state, so a live hover-zoom appeared
in both and cancelled itself out. The suite went green, the flake disappeared, and a
working regression detector had become a no-op — with no line of production code touched.

Two consequences worth internalising:

- **Any edit to a test file, including moving one line within it, must re-run the original
  mutation.** "The test still passes" is the failure signal here, not the success signal.
- **Snapshot every property the effect could plausibly write.** The same assertion recorded
  CSS `transform`, but the utility framework in use writes the separate `scale` property —
  so even before the reordering, that particular zoom was invisible to it.

The general form: a probe's sensitivity is a property of the probe AND its surroundings,
and both drift. Record the mutation that proves the probe fails, next to the probe, and
re-run it whenever either side changes.

## Executable gate

[`probe-sensitivity.template.mjs`](../../../templates/probe-sensitivity.template.mjs) — runs
every configured probe against its decoy mutations and fails the build for any probe that
stayed green. Wire it as a required check next to the probes it audits.

## See also

- [skip-is-a-decision-not-a-default](skip-is-a-decision-not-a-default.md) — the other way a suite reports green without checking
- [regression-test-the-no-op](../../silent-no-op-integrations/rules/regression-test-the-no-op.md) — same principle applied to integrations
