# Enumeration Safety (Status & Timing Oracles)

**When this category bites**: an attacker discovers which emails/handles exist on your
system by observing differences in HTTP responses or response timing.

**Source incidents**: PR#85 had two distinct enumeration-oracle bugs (status code via
503 leak, timing via email-send latency).

## The bedrock rule

**Two responses that branch on a sensitive condition (account exists / does not exist)
must be INDISTINGUISHABLE on every observable channel.**

Observable channels:
1. HTTP status code
2. Response body (size, content)
3. Response time
4. Headers (set-cookie, content-length, ETags, etc.)
5. TLS handshake characteristics (rare but real)

If you leak on ANY of these, your "always returns 204" contract is broken.

## Rules in this category

| Rule | Impact | Trigger |
|------|--------|---------|
| [status-code-oracle](rules/status-code-oracle.md) | CRITICAL | Endpoint contract says "always 204" or "always 200" |
| [timing-oracle](rules/timing-oracle.md) | CRITICAL | One branch awaits an outbound call (email/SMS/HTTP) the other does not |
| [multi-tenant-fail-closed](rules/multi-tenant-fail-closed.md) | HIGH | Querying users by email/phone in a multi-tenant schema |
| [equalizer-quality-bar](rules/equalizer-quality-bar.md) | HIGH | Implementing the timing-equalizer itself |

## Templates

- [enumeration-test-suite.template.ts](../../templates/enumeration-test-suite.template.ts)

## Anti-patterns

- "I'll let 503 propagate so ops can see Resend is down" → leaks existence
- "Email send is fast enough that the timing diff doesn't matter" → 300-2000ms variance is detectable with statistics
- "I'll use findFirst for performance" → cross-tenant collision can hijack reset
- "An attacker can't time individual responses precisely" → with 1000 samples + statistics, sub-100ms differences are detectable

## Historical incidents

| SHA | One-line | Rule that would have prevented it |
|-----|----------|----------------------------------|
| PR#85 round 1 | Resend down → 503 only on existing-account branch | status-code-oracle |
| PR#85 round 2 | Email send took ~500ms; not-found returned in ~10ms | timing-oracle |
| PR#85 round 2 | findFirst on cross-tenant email collision | multi-tenant-fail-closed |
