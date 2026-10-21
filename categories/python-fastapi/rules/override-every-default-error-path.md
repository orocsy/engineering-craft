---
title: Override Every Default Error Path — Four Handlers, One Shape
maturity: draft
impact: HIGH
impact-description: |
  Clients branch on a contract error shape such as `{"error": {code, message, request_id,
  retryable}}`. FastAPI has four independent default paths that bypass a custom
  exception handler: your own errors, request-validation errors (`{"detail": [...]}`,
  which echo input back), Starlette HTTP errors (404/405 `{"detail": "Not Found"}`), and
  unhandled exceptions (plain-text 500). Missing any one sends clients a shape they can't
  parse and can leak input values or exception text.
tags: fastapi, starlette, error-handling, api-contract, information-disclosure, validation
applies-to: |
  Any FastAPI/Starlette API that promises clients a single error schema.
related-rules:
  - validate-responses-against-the-contract-file
  - server-generated-request-id
historical-incidents:
  - KidsBuddy MIU-B01 (2026-10): all four paths mapped to the public Error schema; tests plant a fake DB credential in a crash and assert it never reaches the body
---

## The rule

```python
app.add_exception_handler(ApiError, on_api_error)                    # ours
app.add_exception_handler(RequestValidationError, on_validation)     # 422, hide details
app.add_exception_handler(StarletteHTTPException, on_http_error)     # 404/405/...
app.add_exception_handler(Exception, on_unexpected)                  # 500, generic
```

- Build every error through one function, so the shape cannot drift between handlers.
- Optional is not nullable: serialize with `exclude_none=True` if the schema makes a
  field optional but not nullable (`retry_after_ms`), and test that the key is absent.
- A 500 is "unknown outcome": mark it `retryable: false` and send clients to look up the
  original operation. Blind retries can duplicate side effects such as charges.
- The traceback still goes to server logs; only the response is generic.
- A 401 carries `WWW-Authenticate: Bearer`.

## Tests

One test per path, each validating the body against the contract's Error schema. The
leak test makes the handler raise with a planted secret
(`RuntimeError("postgres://admin:hunter2@...")`) and asserts that the secret, the
exception class name and `Traceback` are absent from `response.text`. Use
`TestClient(app, raise_server_exceptions=False)` to see what a client sees.
