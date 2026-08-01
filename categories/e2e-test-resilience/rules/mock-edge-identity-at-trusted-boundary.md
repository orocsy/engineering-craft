---
title: Mock Edge Identity at the Trusted Boundary, Never with a Production Login Bypass
type: guideline
maturity: verified
impact: HIGH
impact-description: |
  Multi-user E2E tests need distinct identities, but an application-level
  `X-Test-User` shortcut can become a production authentication bypass. The
  harness should impersonate the real trusted edge or test identity provider,
  while production code keeps the same fail-closed authentication path.
tags: e2e, playwright, authentication, trusted-proxy, identity-headers, multi-user
applies-to: |
  Browser tests for applications whose deployment edge, reverse proxy or test
  identity provider establishes user identity before requests reach the app;
  especially collaboration, membership, role and conflict tests.
related-rules:
  - federated-identity-linking
  - selector-coupling-and-blast-radius
historical-incidents:
  - "Private collaboration verification (2026-08-01): the initial plan considered adding a test login path; inspection found an existing edge-owned identity-header contract, so two isolated local browser contexts supplied synthetic .test identities without changing production auth, then verified presence, 409 conflict, fork recovery, 404 non-member denial and 403 owner-only denial"
last-referenced: 2026-08-01
---

## The incident progression

| Stage | What happened |
|-------|---------------|
| Need | Automated tests had covered revision and permission logic, but no live authenticated multi-user browser session had run. |
| Risky first idea | Add a development mock-login route or accept a caller-selected test-user header in application auth code. |
| Discovery | The hosting platform already injects a documented identity header after authentication. The local server can exercise that trust boundary directly. |
| Correction | Create isolated browser contexts with synthetic `.example.test` users and set edge identity headers in the harness only. No app route, cookie or secret was added. |
| Verification | Separate owner/editor/non-member behavior, shared presence, conflict recovery and fork ownership were observed through the real UI, API and database. |

## Trust precondition

Header-based identity is safe only when the production ingress **removes or
overwrites the same headers supplied by the public client**. If that invariant
is not documented and runtime-verified, the headers are attacker-controlled and
must not be used for authentication.

This rule does not say “trust headers.” It says: when the real architecture has
an authenticated trusted proxy, make the local harness emulate that proxy
outside application code.

## Incorrect

```ts
// Ships in the app and can become an auth bypass through config drift.
if (request.headers.get("x-test-user")) {
  return { email: request.headers.get("x-test-user")! };
}
```

`NODE_ENV !== "production"` is not a sufficient seal by itself. Preview and
misconfigured production runtimes regularly use unexpected modes.

## Correct harness shape

```ts
const owner = await browser.newContext({
  extraHTTPHeaders: trustedProxyHeaders({
    email: "owner.e2e@example.test",
    name: "Owner E2E",
  }),
});

const editor = await browser.newContext({
  extraHTTPHeaders: trustedProxyHeaders({
    email: "editor.e2e@example.test",
    name: "Editor E2E",
  }),
});
```

Put guardrails in the harness:

```ts
const baseUrl = new URL(requiredEnv("E2E_BASE_URL"));
if (!["localhost", "127.0.0.1"].includes(baseUrl.hostname)) {
  throw new Error("Synthetic edge identities are local-only");
}
```

Use a real test IdP or an authenticated test-session minting endpoint when the
application itself owns sessions. If a test-only endpoint is unavoidable, seal
it with all of:

- absent from the production route graph or production build;
- explicit test-runtime enablement;
- unguessable server-side authorization;
- synthetic accounts only;
- short expiration and audit logging;
- a production test proving the endpoint returns 404.

## Multi-user browser contract

Each user needs an isolated browser context, not two tabs in one context. Tabs
share cookies and storage and can accidentally test one identity twice.

The minimum collaboration check is:

1. owner creates a shared object;
2. editor joins through the actual invitation/membership path;
3. both contexts see distinct presence;
4. both edit the same base revision;
5. stale writer is rejected without losing local work;
6. non-member denial and owner-only denial are exercised;
7. normal UI paths have no unexpected console errors.

## Tests

- Anonymous local context remains anonymous without harness headers.
- Two contexts expose different server-rendered identities and storage.
- Synthetic identities use reserved non-routable domains such as
  `example.test`.
- Production/public base URLs are rejected before browser launch.
- Production route inventory contains no mock-login endpoint.
- Direct public requests cannot select identity with the trusted header name;
  verify this at the deployed edge, not only in application unit tests.

## Anti-patterns

- Adding `X-Test-User` handling to the normal auth helper.
- Using two tabs and assuming they represent different people.
- Running synthetic-header tests against a public preview.
- Treating an app-level header unit test as proof the CDN strips spoofed input.
- Letting test identities use real employee or customer email domains.
