---
title: Validate Responses Against the Contract File, Not a Copy
maturity: draft
impact: HIGH
impact-description: |
  When the API contract (OpenAPI/JSON Schema) is the source clients generate from, tests
  that check the server's Pydantic model against itself always pass. The model and the
  contract then drift: a renamed field, an added enum value, a dropped `required`, or
  `additionalProperties` loosened, and clients break at runtime while CI stays green.
tags: api-contract, openapi, json-schema, pydantic, fastapi, testing, drift
applies-to: |
  Services that implement a hand-written or shared contract (OpenAPI in the repo, schemas
  shared with mobile/web SDK generators).
related-rules:
  - override-every-default-error-path
  - test-env-must-match-ci-install
historical-incidents:
  - KidsBuddy MIU-B01 (2026-10): every error and /v1/me body is validated with the repo's contract validator; a parity test compares FastAPI's generated MeResponse (fields, required, enums, additionalProperties) with the contract
---

## The rule

1. Load the contract file itself in tests (a shared fixture such as
   `api_validator("MeResponse")`) and validate real HTTP responses against it.
2. Add a parity test between `app.openapi()["components"]["schemas"][X]` and the
   contract's `X`: same property names, same `required`, same enum values, and
   `additionalProperties: false` on both.
3. Keep server models closed (`model_config = ConfigDict(extra="forbid")`) so an
   accidental extra field fails instead of leaking.
4. Add negative fixtures next to the positive ones (a body with `phone`/`scopes`, a body
   missing a required field) so the contract itself is proven to reject them.

## Why both checks

Response validation catches what one request returned. Parity catches what a route
*could* return, including fields that are rarely set.
