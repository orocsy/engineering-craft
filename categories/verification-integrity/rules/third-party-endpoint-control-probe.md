---
title: A Third-Party Endpoint Is Confirmed by a Response, Not by a Document
last-referenced: 2026-09-02
maturity: draft
type: guideline
impact: CRITICAL
impact-description: |
  An OAuth integration was built against a RETIRED authorization host. The host still
  answered: HTTP 200, then a redirect to a normal login page. Every unauthenticated check
  looked healthy, so the failure surfaced only AFTER a real seller account authenticated,
  as an "app key does not exist" error. That was read as "the platform has not
  provisioned our app key", which sent the team into ten days of support tickets,
  registration theories and a full signing-protocol rewrite. The app key had been
  correctly provisioned the entire time. The whole incident was one hostname.
tags: oauth, third-party, endpoint, integration, false-green, control-probe, provisioning
applies-to: |
  Any integration where a host, path, gateway, or credential-to-endpoint pairing is taken
  from documentation, a support reply, a blog post, or a code comment rather than from a
  successful request. Highest risk when the vendor has more than one platform generation
  (legacy and current) and the legacy host still responds.
related-rules:
  - probe-must-fail-on-injected-defect
  - parse-dont-cast-at-trust-boundaries
  - forked-sdk-transport
  - regression-test-the-no-op
  - redirect-handoff-attempt-trail
historical-incidents:
  - a real incident (2026-08/09), catalog sync with a large B2B marketplace's open
    platform. The code pointed at the platform's retired authorization host instead of
    the current open-API host. The retired host answered and redirected to login, so four
    parameter experiments, a signing-protocol rewrite and several support escalations all
    ran against the wrong hostname. A two-request control probe settled it in under a
    minute once anyone ran one.
  - the same incident, a second false negative. A probe was aimed at a look-alike host
    (`openapi-api.` instead of `open-api.`) that rejected every key, including fabricated
    ones. With no control run beside it, the result was read as proof that the app key
    did not exist anywhere, and it aimed the investigation at the vendor's backend for days.
---

## The pattern

Integration endpoints get written down long before they are ever called. A doc page, a
support email, a forum answer, a comment that says `// CONFIRMED from official docs`.
Each copy looks more authoritative than the last, and none of them is evidence.

The trap is that a **retired endpoint rarely 404s**. Vendors keep old hosts alive to
redirect, to serve a deprecation page, or simply because nothing forced them to delete it.
So the wrong host returns `200`, renders a plausible login screen, and fails only at the
one step you cannot automate: after a real human authenticates.

Everything before that point is indistinguishable from success.

## Why it looks safe

Every cheap signal is the same for the right host and a retired one:

- `curl` returns `200` from both;
- both redirect to a real login page, so a "did we reach the vendor" smoke test passes;
- the vendor's own error page is only reachable after authentication;
- your unit tests assert the URL your code builds, which is the URL you believed in;
- CI is green, because none of it makes an authenticated call.

Worse, when the post-login error finally arrives it usually names the wrong culprit —
"app key does not exist", "client not found" — which reads as a provisioning problem on
the vendor's side. That is the sentence that costs the weeks.

## The control probe

Many signed APIs validate in a fixed order: **is this key known → is this signature
valid**. Where that ordering holds, it is a free oracle. Send a deliberately bogus
signature with your real key, then again with a fabricated key of the same shape, and
compare:

```bash
# Real key: reaches SIGNATURE validation => the key RESOLVED on this host.
curl -s -X POST "https://open-api.vendor.example/rest/auth/token/create" \
  -d "app_key=$REAL_APP_KEY&timestamp=$(date +%s000)&code=X&sign=DEADBEEF"
# {"code":"IncompleteSignature", ...}

# Fabricated key, same length and alphabet: rejected EARLIER => the control.
curl -s -X POST "https://open-api.vendor.example/rest/auth/token/create" \
  -d "app_key=999999&timestamp=$(date +%s000)&code=X&sign=DEADBEEF"
# {"code":"InvalidAppKey", ...}
```

How to read the result:

| Real key | Fabricated key | Conclusion |
|---|---|---|
| signature error | unknown-key error | The host knows your key. Look elsewhere. |
| unknown-key error | unknown-key error | **Inconclusive on its own.** Either this host knows no keys (wrong host), or this API does not check the key before the signature, or it returns one generic error for both. |
| same generic error | same generic error | Inconclusive. The probe does not work on this API. |

An identical result becomes "this host does not know the key" only when you have seen the
ordering work: the same probe, on a host where an authenticated call has succeeded, gives
two different errors. Without that, record the result as inconclusive. Do not record it
as a fact about your provisioning.

Properties that make this worth reaching for first:

- **no credentials** — the signature is deliberately wrong, so nothing secret is sent;
- **no side effects** — the request never validates, so nothing is created or consumed;
- **falsifiable** — the fabricated-key control is what makes the result mean anything.

Without the control you will misread the result. In the incident above, a probe against a
look-alike host returned the unknown-key error for the real key; with no control beside
it, that was taken as "the key does not exist" rather than "this host knows no keys".

## A probe proves only the path it called

The probe above calls the token endpoint. It shows that the **API host** knows your key.
It says nothing about the **authorization page**, which is a different path and is often
served by a different host. Verify each endpoint you pin with a request to that endpoint
(for the authorization page: one completed authorization that reached your callback), and
record each verification separately.

## Incorrect

```ts
// endpoints.ts
export const DEFAULT_ENDPOINTS = {
  // CONFIRMED from the official seller-authorization docs
  authorizeBaseUrl: 'https://auth.vendor.example/authorize',   // retired host
  apiBaseUrl: 'https://openapi-api.vendor.example/rest',       // look-alike host
}
```

```ts
// endpoints.test.ts — pins the belief, not the behaviour
test('the confirmed authorize host is the default', () => {
  assert.equal(DEFAULT_ENDPOINTS.authorizeBaseUrl, 'https://auth.vendor.example/authorize')
})
```

The comment claims a confirmation that never happened, and the test makes the unverified
value permanent. Both hosts are wrong, and every green check agrees with them.

## Correct

Record how each endpoint was verified, and pin the values against the specific wrong
answers you already lost time on:

```ts
export const DEFAULT_ENDPOINTS = {
  // API host verified by control probe on the token path (see SDK-PROBE.md):
  //   real key       -> IncompleteSignature  (key RESOLVED)
  //   fabricated key -> InvalidAppKey        (control)
  apiBaseUrl: 'https://open-api.vendor.example/rest',
  // Authorization path verified separately: a completed authorization on <date>
  // reached our callback with a code. `auth.vendor.example` is RETIRED - it still
  // answers and still redirects to login.
  authorizeBaseUrl: 'https://open-api.vendor.example/oauth/authorize',
}
```

```ts
test('the defaults are the CURRENT platform, not a retired or look-alike host', () => {
  for (const value of Object.values(DEFAULT_ENDPOINTS)) {
    // Each name is a specific host that cost real time. Naming them stops a revert.
    assert.ok(!value.includes('auth.vendor.example'),        'retired host')
    assert.ok(!value.includes('openapi-api.vendor.example'), 'look-alike host; rejects every key')
  }
})
```

## Checklist

- [ ] Has any request to this exact host+path ever succeeded, or is the value inherited
      from a document? If inherited, it is UNVERIFIED — say so in the comment.
- [ ] Run the control probe: real credential vs fabricated credential of the same shape,
      same host, same malformed signature. Do the errors DIFFER? If they are the same,
      the result is inconclusive until you have seen the ordering work on a known-good host.
- [ ] Did the probe call the same path you are pinning? A token-path probe does not
      verify the authorization page.
- [ ] Read the hostnames character by character. `open-api` and `openapi-api` are
      different hosts; so are `api.vendor.example` and `api-vendor.example`.
- [ ] Does the vendor have a legacy platform generation whose host still answers?
- [ ] When a post-authentication error blames YOUR provisioning, re-run the control probe
      before believing it.
- [ ] Do not change protocol, signing, or several parameters at once to chase a failure
      you have not localised. One variable per experiment.

## The meta-lesson

In this incident the phrase `CONFIRMED from official docs` was written twice, in two
files, about endpoints that had never been called once. It then survived a dozen reviews
because it read like evidence.

**An endpoint is confirmed when a request to it succeeds. Until then the comment should
say ASSUMED-UNVERIFIED, and the reviewer should treat it as a live risk, not a footnote.**

## See also

- [probe-must-fail-on-injected-defect](probe-must-fail-on-injected-defect.md) — the same
  idea for your own checks: a probe means nothing until you have seen it fail
- [redirect-handoff-attempt-trail](../../observability/rules/redirect-handoff-attempt-trail.md)
  — the companion rule from the same incident: record whether the vendor came back
