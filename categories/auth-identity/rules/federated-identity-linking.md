---
title: Federated Login May Only Match an Already-Linked Subject — email_verified Is Not Proof of Ownership
maturity: verified
impact: CRITICAL
impact-description: |
  An OAuth login flow that links an incoming federated identity onto an
  existing account matched by verified email ALONE is an account-takeover
  path: on Google Workspace / custom domains, a domain admin can mint any
  local-part, pass email_verified=true, and land inside the victim's account
  with a silently-linked subject for persistence. Found as a pre-existing P1
  by a pre-push review; the feature's own design doc had wrongly called the
  email fallback "safe".
tags: oauth, google, sso, account-linking, takeover, auth, security
applies-to: |
  Any "Sign in with X" flow that can encounter an existing local account with
  the same email — especially B2B/multi-tenant products where customers use
  Workspace/custom domains.
related-rules: []
historical-incidents:
  - a real incident: loginWithGoogle linked the incoming Google subject onto a password-created operator account matched by verified email alone and signed in — Workspace-domain takeover path; the execution doc had called it safe
---

## The wrong mental model

"`email_verified: true` means the user owns that mailbox." It does not. It
means the IdP vouches the email is verified WITHIN ITS OWN NAMESPACE. On
Google Workspace (or any custom-domain IdP tenancy), the domain ADMIN controls
that namespace: they can create `victim@their-domain.com` as a fresh Google
identity any time. If your victim registered with password using that email,
the attacker's brand-new Google identity now email-matches the victim's
account.

## The rule

An **unauthenticated** OAuth round-trip may sign a user in ONLY by matching
the stored, previously-linked subject (`googleSubject === payload.sub`).

- **Email fallback onto an account with a NULL subject → refuse** (e.g.
  `ConflictException: account exists but isn't linked — sign in with email
  and password`). Map to a clear UX reason (`account_not_linked`).
- **First-time linking is a privileged action**: it happens only from an
  authenticated session ("Connect Google" in account settings) — the user
  proves account ownership by BEING logged in, then attaches the subject.
- Register-mode with the same collision maps to `account_exists`.

```ts
const user = await users.findFirst({ where: { OR: [
  { googleSubject: payload.sub },          // linked → sign in
  { email: payload.email },                // exists → decide below
]}});
if (user && user.googleSubject === payload.sub) return signIn(user);
if (user && user.googleSubject == null)
  throw new ConflictException('account_not_linked');  // NEVER silently link
```

## Tests

- Email-match + null subject: asserts the guard THROWS and `user.update` is
  never called (no silent link).
- Already-linked subject: signs in unchanged.
- UX mapping: login → `account_not_linked` copy; register → `account_exists`.

## Anti-patterns

- "email_verified means it's safe to link" — it proves IdP-namespace
  verification, not mailbox/account ownership.
- Linking-on-login as a convenience ("users hate the extra step") — the extra
  step is the security boundary.
- Trusting the design doc's "safe" claim without tracing the attacker path —
  write the attack as a test, not a paragraph.
