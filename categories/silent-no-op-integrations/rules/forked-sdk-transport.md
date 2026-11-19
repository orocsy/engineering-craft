---
title: If You Send What the SDK Would Have Sent, You Forked It
last-referenced: 2026-08-06
maturity: proven
type: guideline
impact: CRITICAL
impact-description: |
  A minor-looking dependency bump changed an SDK's upload WIRE PROTOCOL — multipart POST
  with credential form fields became a raw PUT with credential headers — while the method
  signature and return shape stayed byte-identical. Application code that assembled the
  request itself kept POSTing. Every file upload in the product died with
  403 SignatureDoesNotMatch. Type-checking, 420 unit tests, and the read-only browser
  suite were all structurally incapable of seeing it.
tags: sdk, wire-protocol, upgrade, presigned-credential, upload, browser-direct, false-green
applies-to: |
  Any place your code performs an HTTP request built from values an SDK method MINTED —
  presigned upload credentials, signed URLs, STS tokens, direct-to-storage browser uploads
  — instead of calling the SDK method that would have SENT it. Also every version bump of
  such an SDK.
related-rules:
  - probe-must-fail-on-injected-defect
  - regression-test-the-no-op
  - four-consumer-rule
  - libs-first-no-reinventing
historical-incidents:
  - a real incident: browser-direct object upload. The server minted a credential with the
    SDK and returned it; the browser posted a multipart form. A node SDK major changed the
    signed verb to PUT with the credential in headers. Signature and return type were
    unchanged, so nothing typed or unit-tested moved. Both upload surfaces were dead in the
    deployed environment, and the only check that could observe it was an optional CI smoke
    defaulting to OFF.
---

## The pattern

An SDK usually offers two halves: a MINTER (`getUploadMetadata`, `createPresignedPost`,
`getSignedUrl`) and a SENDER (`uploadFile`, `putObject`). When bytes must leave the
browser rather than your server, you call the minter and reimplement the sender.

That reimplementation is a FORK of the SDK's private behaviour. The public surface you
type against — argument shape, return shape — says nothing about the verb, the credential
placement, or the body encoding the signature was actually computed over. Those live in
the sender's function body, which you did not call and TypeScript never reads.

A signature is computed over a specific verb and a specific credential placement. Change
either and the request is rejected — by the storage provider, at runtime, in production
only.

## Why it looks safe

Every signal an engineer normally trusts is invariant across this class of change:

- the minter's argument and return types are unchanged, so `tsc` is silent;
- unit tests mock the minter, so they assert your own fixture back to you;
- read-only E2E never uploads, so the browser suite stays green;
- the changelog says "dependency bump", because from the SDK's own point of view the
  public API genuinely did not change — only its internal sender did.

## Incorrect

```ts
// Server: mint with the SDK. Browser: hand-roll the send.
const meta = await sdk.getUploadMetadata({ cloudPath })   // ✅ SDK call
return { url: meta.data.url, fields: { Signature: meta.data.authorization, ... } }

// Browser — a fork of the SDK's sender, pinned to nothing:
const form = new FormData()
form.append('Signature', intent.upload.fields.Signature)
form.append('file', file)
await fetch(intent.upload.url, { method: 'POST', body: form })
```

Nothing in this code, or in any type it touches, references what the installed SDK
actually does. It encodes a belief about a protocol.

## Correct — register the fork and pin it to the SDK's own body

```js
// scripts/verify-<sdk>-contract.mjs — runs in CI, fails the build.
const body = sdkFunctionBody(installedStorageSource, 'uploadFile')  // THROWS if absent
requireCheck(/method:\s*['"]put['"]/.test(body), 'SDK sender uses PUT')
requireCheck(!/formData/.test(body),             'SDK sender does not build a form')

// Both sides must match the SDK, and the client list is DERIVED, not remembered:
const clients = execSync("git grep -ln --untracked 'intent\\.upload\\.' -- apps packages")
  .toString().trim().split('\n')
requireCheck(clients.length === EXPECTED, 'every upload client is pinned')
for (const f of clients) {
  const src = readFileSync(f, 'utf8')
  requireCheck(/headers: intent\.upload\.headers/.test(src), `${f} sends credential headers`)
  requireCheck(!/new FormData\(/.test(src),                  `${f} does not rebuild a form`)
}
```

Three properties make this work, and all three are load-bearing:

1. **Assert against the installed sender's FUNCTION BODY**, not the module text — a
   whole-file grep matches the control-plane request, which is legitimately a POST, and
   certifies the broken state (see `probe-must-fail-on-injected-defect`).
2. **The extractor throws when its target is missing.** Returning `''` makes every
   positive regex fail for the wrong reason and every NEGATIVE regex pass forever.
3. **Derive the client list by grep with a pinned expected count.** A hand-listed set
   encodes the author's memory, which is the thing under test — in the real incident the
   first fix migrated the one client the author remembered and a second, inlined client
   kept POSTing and broke again.

## The tell, in review

- A `fetch`/`XMLHttpRequest` whose URL, headers, or body fields come from a server
  response that was itself produced by an SDK call.
- A diff that changes only `package.json` / lockfile versions for such an SDK. This is the
  highest-risk shape in this whole class, because the diff contains no call-site changes
  to review.
- A comment asserting third-party behaviour ("the SDK returns `{data: null}` for missing")
  with no check enforcing it. Prose about someone else's runtime is an unversioned claim
  that rots on every bump — either assert it and cite the assertion, or delete it.

## Executable gate

Keep a small registry (`{pkg, pinnedVersion, minter, sender, senderSourceFile,
clientGrep, expectedClientCount}`) and fail CI when the installed version differs from
`pinnedVersion` — that forces re-derivation on every bump instead of hoping someone
remembers. Wire it into the always-on lint/test job, not an optional dispatch input.

Pair it with a REAL upload smoke on the automatic trigger. In the incident, the only check
capable of observing the outage was an optional smoke defaulting to false; it was off for
two consecutive releases while "all gates green" was reported.

## See also

- `probe-must-fail-on-injected-defect` — why the whole-file grep certified the break
- `four-consumer-rule` — finding every consumer instead of the remembered one
- `regression-test-the-no-op` — proving the integration actually does something
