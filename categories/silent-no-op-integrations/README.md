# Silent No-Op Integrations

**When this category bites**: a third-party API wrapper "succeeds" while doing nothing
because the API key wasn't configured. Tests pass against the contract; production
silently drops emails / SMS / payments / events.

**Source incidents**: a real production receipt — a `notification.service` `sendEmail()`
had been silently returning `false` in any env without `RESEND_API_KEY` for months. Tests
proved contract delivery, not actual delivery. Discovered only when password reset stopped
working in production.

## The bedrock rule

**A third-party API wrapper that can be in a "configured" or "not configured" state
must make that state visible. Silent fallback to no-op is the worst possible failure
mode.**

The three required behaviors:

1. **Boot-time mode log**: print one of `LIVE` / `DISABLED` to stdout at boot. Ops
   reads logs; surprises are eliminated.
2. **Hard-fail in production**: env schema must require the API key in production
   (`superRefine` block). Container won't start without it.
3. **Required-variant for security-critical call sites**: provide separate
   `*Required()` helpers that throw 503 when the integration is disabled, used only
   on call sites where silent skip is unacceptable (password reset emails, payment
   completion).

## Rules in this category

| Rule | Impact | Trigger |
|------|--------|---------|
| [configured-state-visible](rules/configured-state-visible.md) | CRITICAL | Wrapping any third-party API client |
| [required-variant-for-security](rules/required-variant-for-security.md) | CRITICAL | Security-critical call sites that depend on the integration |
| [regression-test-the-no-op](rules/regression-test-the-no-op.md) | HIGH | Testing the wrapper itself |
| [middleware-error-mapping](rules/middleware-error-mapping.md) | MEDIUM | Every npm middleware throwing non-HttpException needs a domain-specific filter |
| [unconsumed-terminal-events](rules/unconsumed-terminal-events.md) | HIGH | Local code puts a vendor object into a state (cancel/expire/void) whose event type is unhandled |

## Templates

- [integration-boot-log.template.ts](../../templates/integration-boot-log.template.ts)

## Checklists

- [New third-party integration checklist](../../checklists/new-third-party-integration.md)

## Anti-patterns

- "I'll silently no-op so devs without the key can still run the app" — masks misconfig
  in prod
- "I'll log a warn at the call site" — call sites are many; people will deploy without
  noticing
- "Tests verify the integration works" — tests verify the contract; in prod with no
  key, the wrapper short-circuits before reaching the contract

## Historical incidents

| Incident | One-line | Rule that would have prevented it |
|----------|----------|----------------------------------|
| Pre-incident | `sendEmail` silently returned false without RESEND_API_KEY for months | configured-state-visible + required-variant-for-security |
| Review round 1 | Password reset endpoint awaited `sendEmail` which short-circuited; user got "success" but no email | required-variant-for-security |
