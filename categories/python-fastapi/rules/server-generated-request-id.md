---
title: Request IDs Come From the Server, on Every Response
maturity: draft
impact: MEDIUM
impact-description: |
  A request/correlation ID links a user's report ("it failed at 9:14") to one log line
  and, later, to worker and outbox records. If the server adopts a client-sent
  `X-Request-ID`, callers can inject newlines to forge log lines, reuse another user's ID
  to confuse an investigation, or flood the log index with chosen keys. If only error
  responses carry an ID, successful-but-wrong responses can't be traced.
tags: observability, request-id, correlation-id, logging, log-injection, middleware, fastapi
applies-to: |
  Any HTTP service that logs per request or that clients and support staff need to
  correlate with logs.
related-rules:
  - override-every-default-error-path
historical-incidents:
  - KidsBuddy MIU-B01 (2026-10): middleware assigns req_<uuid4hex> to request.state and X-Request-ID; tests send "evil\nlog-line" and assert it's ignored
---

## The rule

- Generate the ID on the server (`f"req_{uuid.uuid4().hex}"`). A type prefix makes IDs
  self-describing in logs.
- Store it per request (`request.state.request_id`) and set it on every response, success
  and failure, as `X-Request-ID`.
- Put the same value in error bodies (`error.request_id`).
- Set the header inside the 500 handler too: an unhandled exception passes up through
  your middleware without returning, so the middleware's "add header on the way out"
  line never runs.
- If an upstream proxy you control sets a trusted trace header, record it as a separate
  field after validating its format. Never let it replace the server ID.

## Tests

- Two requests get different IDs.
- A client-sent `X-Request-ID` (including one with a newline) does not appear in the response.
- Error body `request_id` equals the response header.
