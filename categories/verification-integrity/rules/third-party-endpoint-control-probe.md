---
title: A Third-Party Endpoint Is Confirmed by a Response, Not by a Document
last-referenced: 2026-09-02
maturity: proven
type: guideline
impact: CRITICAL
impact-description: |
  An OAuth integration was built against a RETIRED authorization host. The host still
  answered: HTTP 200, then a redirect to a normal login page. Every unauthenticated check
  looked healthy, so the failure surfaced only AFTER a real merchant authenticated, as
  `param-appkey.not.exists`. That was read as "the platform has not provisioned our app
  key", which sent the team into ten days of support tickets, ISV-registration theories,
  and a full protocol rewrite. The app key had been correctly provisioned the entire time.
  The whole incident was one hostname.
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
historical-incidents:
  - Alibaba.com ICBU catalog sync, 2026-08/09. `oauth.alibaba.com` (retired) vs
    `open-api.alibaba.com` (current). The retired host answered and redirected to login,
    so four separate parameter experiments, a GOP->TOP protocol rewrite, and multiple
    support escalations all ran against the wrong hostname. A two-command control probe
    settled it in under a minute once anyone thought to run one.
  - Same incident, second false negative - a probe was aimed at
    `openapi-api.alibaba.com`, which is a DIFFERENT host from `open-api.alibaba.com`. It
    returned `InvalidAppKey` for every key including fabricated ones. That result was read
    as proof the app key did not exist anywhere, and it aimed the investigation at the
    vendor's backend for days.
---

## The pattern

Integration endpoints get written down long before they are ever called. A doc page, a
support email, a Stack Overflow answer, a comment that says `// CONFIRMED from official
docs`. Each copy looks more authoritative than the last, and none of them is evidence.

The trap is that a **retired endpoint rarely 404s**. Vendors keep old hosts alive to
redirect, to serve a deprecation page, or simply because nothing forced them to delete it.
So the wrong host returns `200`, renders a plausible login screen, and fails only at the
one step you cannot automate: after a real human authenticates.

Everything before that point is indistinguishable from success.

## Why it looks safe

Every cheap signal is invariant between the right host and a retired one:

- `curl` returns `200` from both;
- both redirect to a real login page, so a "did we reach the vendor" smoke test passes;
- the vendor's own error page is only reachable post-authentication;
- your unit tests assert the URL your code builds, which is the URL you believed in;
- CI is green, because none of it makes an authenticated call.

Worse, when the post-login error finally arrives it usually names the wrong culprit —
"app key does not exist", "client not found" — which reads as a provisioning problem on
the vendor's side. That is the sentence that costs the weeks.

## The control probe

Most signed APIs validate in a fixed order: **is this key known → is this signature
valid**. That ordering is a free oracle. Send a deliberately bogus signature with your
real key, then again with a fabricated key, and compare:

```bash
# Real key: reaches SIGNATURE validation => the key RESOLVED on this host.
curl -s -X POST "https://open-api.alibaba.com/rest/auth/token/create" \
  -d "app_key=511630&timestamp=$(date +%s000)&sign_method=sha256&code=X&sign=DEADBEEF"
# {"code":"IncompleteSignature","message":"The request signature does not conform..."}

# Fabricated key: rejected EARLIER => the control.
curl -s -X POST "https://open-api.alibaba.com/rest/auth/token/create" \
  -d "app_key=999999999&timestamp=$(date +%s000)&sign_method=sha256&code=X&sign=DEADBEEF"
# {"code":"InvalidAppKey","message":"The specified App Key is invalid"}
```

**Two different errors means the host knows your key.** One identical error means it does
not — and that is a fact about the HOST, not about your provisioning.

Properties that make this worth reaching for first:

- **no credentials** — the signature is deliberately wrong, so nothing secret is sent;
- **no side effects** — the request never validates, so nothing is created or consumed;
- **falsifiable** — the fabricated-key control is what makes the result mean anything.

Without the control you will misread the result. In the incident above, a probe against a
similarly-named host returned `InvalidAppKey` for the real key; with no control run
alongside, that was taken as "the key does not exist" rather than "this host knows no keys
at all".

## Incorrect

```ts
// endpoints.ts
export const DEFAULT_ENDPOINTS = {
  // CONFIRMED from the official seller-authorization docs (2026-08-06)
  authorizeBaseUrl: 'https://oauth.alibaba.com/authorize',
  apiBaseUrl: 'https://openapi-api.alibaba.com/rest',
}
```

```ts
// endpoints.test.ts — pins the belief, not the behaviour
test('the confirmed authorize host is the default', () => {
  assert.equal(DEFAULT_ENDPOINTS.authorizeBaseUrl, 'https://oauth.alibaba.com/authorize')
})
```

The comment asserts confirmation that never happened, and the test then makes the
unverified value permanent. Both hosts here are wrong, and every green check agrees with
them.

## Correct

Record how the endpoint was verified, and pin the value against regression to the specific
wrong answers you already burned time on:

```ts
export const DEFAULT_ENDPOINTS = {
  // Host verified by control probe (see SDK-PROBE.md):
  //   open-api + real key       -> IncompleteSignature  (key RESOLVED)
  //   open-api + fabricated key -> InvalidAppKey        (control)
  // `oauth.alibaba.com` is RETIRED - it still answers and still redirects to
  // login, which is why the failure only appeared after a real merchant login.
  authorizeBaseUrl: 'https://open-api.alibaba.com/oauth/authorize',
  apiBaseUrl: 'https://open-api.alibaba.com/rest',
}
```

```ts
test('the default host is the CURRENT platform, not a retired one', () => {
  assert.equal(DEFAULT_ENDPOINTS.authorizeBaseUrl,
    'https://open-api.alibaba.com/oauth/authorize')
  for (const value of Object.values(DEFAULT_ENDPOINTS)) {
    // Each name is a specific host that cost real time. Naming them stops a revert.
    assert.ok(!value.includes('oauth.alibaba.com'),      'retired host')
    assert.ok(!value.includes('openapi-api.alibaba.com'), 'different host; rejects every key')
  }
})
```

## Checklist

- [ ] Has any request to this exact host+path ever succeeded, or is the value inherited
      from a document? If inherited, it is UNVERIFIED — say so in the comment.
- [ ] Run the control probe: real credential vs fabricated credential, same host, same
      malformed signature. Do the errors DIFFER?
- [ ] Read the hostnames character by character. `open-api` and `openapi-api` are
      different hosts; so are `api.x.com` and `api-x.com`.
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
