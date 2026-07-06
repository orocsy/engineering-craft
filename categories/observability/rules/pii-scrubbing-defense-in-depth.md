---
title: PII Scrubbing Is Defense-in-Depth — an SDK Flag Is Not Enough
maturity: proven
impact: CRITICAL
impact-description: |
  Telemetry leaves your infrastructure by definition (it goes to a vendor). Under
  GDPR / CCPA / regional privacy law, customer PII (name, phone, email, address) must
  not leave raw. A "don't send default PII" SDK flag only covers what the SDK
  auto-collects — application-controlled values (exception messages, breadcrumbs,
  contexts) leak straight through. A real cross-file review found PII reaching the
  vendor via three un-scrubbed event surfaces.
tags: observability, pii, privacy, sentry, telemetry, gdpr, security
applies-to: |
  Any service that sends errors or analytics to a third-party telemetry vendor and
  handles personal data. Especially anywhere user input or customer records can end up
  in an exception message, a breadcrumb, a request header, or a query string.
related-rules:
  - tenant-tagging-and-cross-tenant-guard
historical-incidents:
  - a cross-file review found 3 telemetry event surfaces (auth headers, query-string tokens, a custom context field) that PII could leak through, with no test covering them
---

## Why an SDK flag is not enough

`sendDefaultPii: false` (or any vendor's equivalent) only stops the SDK's **built-in**
collection — IP addresses, cookies, request headers it auto-attaches. It does NOT touch
**application-controlled** values: exception messages, breadcrumbs, custom contexts,
extras. Those need an explicit filter that you run in the vendor's "last chance before
send" hook (Sentry `beforeSend`, etc.).

The realistic leak:

```ts
throw new Error(`Failed to notify customer at ${customer.phone}`);
// the phone is in the exception MESSAGE — the SDK's PII flag never inspects it
```

or a React render error in a component that displays a customer email as text — the
email lands in the error's component-stack context.

## Two layers: KEY-based + VALUE-based

Neither layer alone is sufficient — run both.

| Layer | Catches | Why the other layer is still needed |
|-------|---------|--------------------------------------|
| **KEY-based**: any object key matching `/email\|phone\|address\|name/i` → value replaced with `[REDACTED]` | Structured payloads (`{ customerEmail, customerPhone }`) — even when the value wouldn't match a value regex (empty, partial, a name that looks like an ordinary word) | Misses PII interpolated into a free-text string where the key is `message`/`value` |
| **VALUE-based**: every string regex-scanned for email + phone patterns → matches replaced | PII inside exception messages (`"Failed to send to a@b.c"`) | Misses arbitrary names (no regex catches them) and national-format phones in free text |

## The event surfaces (where PII hides)

A telemetry event is a tree. PII can live in ANY node — the scrubber must walk every one.
A scrubber that handles `message` + `exception` + `user` but skips `request.headers` /
`request.query_string` / `contexts` leaks through the un-walked surfaces:

```
event
├── message                      (top-level captured string)
├── exception.values[].value     (exception messages)
├── breadcrumbs[].message        (audit-trail strings)
├── breadcrumbs[].data           (structured breadcrumb payloads)
├── request.data                 (POST body, if populated)
├── request.headers              (Authorization, custom x-customer-* headers)
├── request.query_string         (?email=...&phone=... in the URL)
├── contexts.*                   (custom contexts: device, state, customer)
├── extra.*                      (arbitrary attached debug data)
└── user.{email,username,ip}     (keep user.id for grouping)
```

The test suite must assert a redaction on EVERY surface — the ones that get skipped are
exactly the ones that leak (auth headers, query-string tokens, custom context fields are
all real attack paths).

## The regexes — and why phone requires a leading `+`

```ts
const PII_KEY_PATTERN = /email|phone|address|name/i;            // substring, case-insensitive
const EMAIL_VALUE     = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_VALUE     = /\+[0-9](?:[-.\s()]?[0-9]){6,14}/g;      // E.164, REQUIRES leading +
```

- **Phone requires `+`.** Without it, the regex false-positives on ISO-8601 dates
  (`2026-06-01`), DB timestamps (`2026-06-01 10:00:00`), and other digit-heavy free text
  — which is everywhere in error messages. Requiring `+` (E.164) is the accepted
  trade-off: it misses national-format phones in FREE TEXT, but those are still caught by
  the KEY layer when they appear in structured payloads (`customerPhone: "9123 4567"`).
- **`/name/i` as a substring** covers `firstName`, `lastName`, `fullName`, `customerName`
  without enumerating them. Trade-off: it also redacts a benign `name` key (e.g. an OS
  context's name) — a harmless over-redact. Lock the behavior with a test so a future
  regex tightening must consciously reconsider it.

## Immutability: return a NEW event, never mutate

SDKs cache event references internally (for last-event-id, scope merging, the
before-send chain). Mutating a shared reference can corrupt that state, makes the
scrubber un-composable, and causes cross-test pollution.

```ts
export function scrubPiiFromEvent<T extends EventLike>(event: T): T {
  const out: Record<string, unknown> = { ...(event as Record<string, unknown>) };
  if (event.message !== undefined) out.message = scrubPiiInString(event.message);
  if (event.exception?.values) {
    out.exception = {
      ...event.exception,
      values: event.exception.values.map(exc => ({
        ...exc,
        value: exc.value !== undefined ? scrubPiiInString(exc.value) : exc.value,
      })),
    };
  }
  // …walk every other surface the same way: new object, new nested structures…
  return out as T;
}
```

Assert immutability with a deep-equality check against a pre-scrub snapshot of the input.

## Decoupling: one scrubber, every runtime

A multi-runtime app (API + web + worker) has multiple telemetry init points. If each
re-implements scrubbing, they drift. Put the scrubber in ONE shared module that every
runtime imports, so the redaction rules have a single source of truth. (This is also why
the shared module must be consumable by every build context — see the workspace-package
build-parity concern in cross-file-seams.)

## A different surface is NOT covered by this scrubber

The error-tracker `beforeSend` scrubber does not run on your **analytics** vendor's
payloads — that's a separate SDK with its own masking config (input masking, autocapture
text masking, session-replay masking). Scrubbing errors does not scrub analytics. Treat
each vendor surface independently.

Two real leak shapes from one rollout: (1) autocapture sent element TEXT in event
properties (`$elements`) even though session-replay masking was on — replay masking and
autocapture masking are separate switches (`mask_all_text` + `mask_all_element_attributes`
at the top level, verified in the installed types); (2) a server-side event carried a
customer-typed free-text field (a cancellation reason with phones/emails) into analytics
properties — the error-tracker scrubber never sees those. Fix shape: never forward raw
free-text; emit derived analytics-safe fields (`hasReason`, `reasonLength`) and assert in
a test that the raw text never appears in the captured payload.

## Tests

- One test per event surface in the tree above — assert PII on that surface is redacted.
- Immutability: deep-equal the input against a pre-call snapshot.
- Phone-vs-date: assert a date/timestamp is NOT redacted and a `+E.164` phone IS.
- The benign-`name`-key over-redact: assert it (so tightening is a conscious choice).

## Anti-patterns

- "We set `sendDefaultPii: false`, we're compliant" — that flag ignores every
  application-controlled value.
- Scrubbing `message` + `user` only — the un-walked surfaces (headers, query string,
  contexts, breadcrumb data) are where it actually leaks.
- Mutating the event in place — corrupts SDK-cached references; use a new object.
- A per-runtime copy of the scrubber — they drift; share one module.
- No surface-by-surface test — the missing test is the leaking surface.
