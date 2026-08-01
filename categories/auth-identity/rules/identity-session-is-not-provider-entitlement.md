---
title: Identity OAuth Is Not Provider API Entitlement
type: decision
maturity: verified
impact: HIGH
impact-description: |
  A user signing in with an AI or SaaS account proves an identity to the
  application; it does not automatically delegate the user's consumer
  subscription quota, API billing account or reusable provider credential.
  Conflating the two either creates a non-working feature or leaks a server API
  key into the browser.
tags: oauth, identity, entitlement, api-keys, ai-provider, quota, billing
applies-to: |
  Sign in with provider flows combined with paid API features, especially AI
  generation, document analysis, storage, messaging or payment services.
related-rules:
  - federated-identity-linking
  - configured-state-visible
  - required-variant-for-security
historical-incidents:
  - "Private document-to-workflow feature (2026-08-01): a user asked whether signing in with a consumer AI subscription could fund document analysis; the design separated sign-in identity from inference entitlement and used a server-side provider adapter, explicit configured state, atomic per-principal allowance and reviewed local fallback"
last-referenced: 2026-08-01
---

## The incident progression

| Stage | What happened |
|-------|---------------|
| Product idea | Let signed-in users ask AI to turn design documents into editable building blocks. |
| Assumption questioned | “If users sign in with the AI provider, can the app seamlessly use their subscription quota?” |
| Boundary discovered | The login integration returned application identity. It did not return a transferable inference credential or API billing entitlement. |
| Correction | Keep sign-in for identity and authorization; configure AI providers server-side; rate-limit spend per authenticated principal; retain a local, no-key analysis path. |

## Model the boundaries separately

```text
Authentication: Who is this caller?
Authorization: May this caller use this product feature?
Entitlement: Which account pays or supplies quota?
Provider credential: What secret authorizes the API request?
Usage control: How much may this principal spend and when?
```

One OAuth flow may cover more than one boundary only when the provider's
documented scopes and token audience explicitly say so. A familiar brand on the
login button is not evidence.

## Incorrect

```ts
// Consumer login token is assumed to work as an API key.
const session = await signInWithProvider();
await fetch(providerInferenceUrl, {
  headers: { Authorization: `Bearer ${session.accessToken}` },
});
```

Problems:

- the token audience may be the app's identity endpoint, not the API;
- consumer subscription and API billing can be separate products;
- putting a privileged provider key in browser code exposes it to every user;
- no app-level quota prevents one user from exhausting shared spend.

## Correct shape

```ts
const user = await requireApplicationIdentity(request);
await authorizeFeature(user, "document-analysis");
await claimUsageAllowanceAtomically(user.id, utcDay());

const provider = configuredServerProvider();
const raw = await provider.generate(validatedPrompt);
return validateProviderOutput(raw);
```

Expose configured state without exposing secrets:

```json
{
  "authenticated": true,
  "featureAvailable": true,
  "provider": "configured-router",
  "remainingAllowance": 7
}
```

Provider keys remain in server runtime configuration. The UI can show the
provider class and privacy boundary, but never the secret or an editable key
field unless bring-your-own-key is an explicit, separately threat-modeled
product.

## Verification questions

Before claiming a login can fund an API call, answer from provider docs:

1. What is the token audience?
2. Which exact scope authorizes this API?
3. Is consumer subscription quota documented as API entitlement?
4. Can the token be used by this third-party application and backend?
5. Who is billed, and where is revocation handled?
6. May the token be stored or refreshed by this application?

If any answer is unknown, treat identity and entitlement as separate.

## Tests

- Signed-in user plus unconfigured provider returns a clear unavailable state,
  not success or a silent no-op.
- Anonymous caller cannot spend shared provider quota.
- Usage claim is atomic and occurs before the external request.
- Provider credential never appears in client bundles, HTML, logs or responses.
- Provider output is runtime-validated before mutating canonical product data.
- Local/no-key fallback is labeled as local and does not pretend AI ran.

## Anti-patterns

- “Sign in with X” means “use X's paid API.”
- Asking users to paste the application owner's API key into a browser form.
- Anonymous paid inference on a public endpoint.
- Hiding missing provider configuration behind a successful empty response.
- Treating model JSON as trusted because the API call itself was authenticated.
