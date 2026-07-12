# Auth & Identity (federated login, account linking)

**When this category bites**: a "Sign in with X" flow meets an existing local
account with the same email, and a convenience decision (auto-link, auto-login)
quietly becomes an account-takeover path.

**Source incidents**: a pre-push review caught an email-only Google-subject
linking path in an operator login flow — a Workspace-domain admin could mint the
victim's local-part and land inside the victim's tenant with operator tokens.
The feature's own design doc had called the fallback "safe".

## The bedrock rule

**An unauthenticated OAuth round-trip may only sign in an ALREADY-LINKED
subject.** `email_verified` proves IdP-namespace verification, not mailbox or
account ownership. First-time linking of a federated identity onto an existing
local account is a privileged action that requires an authenticated session
("Connect X" in settings) — never a side effect of login or registration.

## Rules in this category

| Rule | Impact | Trigger |
|------|--------|---------|
| [federated-identity-linking](rules/federated-identity-linking.md) | CRITICAL | Any OAuth/SSO login that can encounter an existing same-email local account |
| [server-rederives-sensitive-classification](rules/server-rederives-sensitive-classification.md) | HIGH | Sensitive-field gating (medical, PII) depends on payload structure the client creates |

## Anti-patterns

- "email_verified: true means it's safe to link" — on Workspace/custom domains the
  domain admin controls the namespace.
- Auto-linking at login "to reduce friction" — the friction IS the boundary.
- Accepting a design doc's "safe" verdict without writing the attacker path as a test.
