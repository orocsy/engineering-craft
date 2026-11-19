# Python & FastAPI (service structure, errors, contracts)

**When this category bites**: a FastAPI service passes its tests but returns
`{"detail": ...}` or a plain-text 500 to clients that expect the contract error shape;
tests need a "test mode" flag to inject identities; one blocking call stalls every
request; CI's install command doesn't install the package the tests import; the server
model drifts from the OpenAPI contract that mobile and web clients generate from.

**Source incidents**: one new FastAPI service's entry point and identity boundary
(2026-10). All rules start as `draft` and earn promotion as other services apply them.

## Rules in this category

| Rule | One-line |
|------|----------|
| [app-factory-not-import-time-app](rules/app-factory-not-import-time-app.md) | Build the app in `create_app()` and run with `uvicorn ...:create_app --factory`; tests get clean instances and override dependencies per instance, so production needs no test switch. |
| [liveness-check-stays-closed](rules/liveness-check-stays-closed.md) | Liveness returns a fixed body, calls no dependency and reveals no version, host or config; readiness is a separate route; pin the exact body in a test. |
| [test-env-must-match-ci-install](rules/test-env-must-match-ci-install.md) | In uv workspaces, a root `uv sync` doesn't install members or their dev groups; put the package under test and its test tools in the root dev group so CI and `uv run pytest` see the same environment. |
| [override-every-default-error-path](rules/override-every-default-error-path.md) | Register handlers for your error, `RequestValidationError`, Starlette `HTTPException` and bare `Exception`; build all errors through one function; 500 is not retryable; plant a secret and assert it never reaches the body. |
| [server-generated-request-id](rules/server-generated-request-id.md) | Generate `req_<uuid>` on the server for every response, ignore client-sent IDs (log injection), echo it in the error body, and set it in the 500 handler too. |
| [validate-responses-against-the-contract-file](rules/validate-responses-against-the-contract-file.md) | Validate real responses against the shared contract file and add a parity test between FastAPI's generated schema and the contract; closed models plus negative fixtures. |

## Candidates (no incident yet)

Not rules until a real incident is recorded (see knowledge-management: "no incident = no rule"):

- **Never block inside `async def`.** One blocking call (`time.sleep`, `requests`, a sync DB
  driver) in an `async def` route freezes every in-flight request. Use plain `def` for
  blocking libraries, or `await anyio.to_thread.run_sync(fn)`.

## Related

- [observability](../observability/README.md): liveness vs readiness in the three-pillar model.
- [parse-dont-cast-at-trust-boundaries](../verification-integrity/rules/parse-dont-cast-at-trust-boundaries.md): Pydantic at every inbound edge.
- [payload-shape-drift-against-strict-dto](../grep-for-siblings/rules/payload-shape-drift-against-strict-dto.md): the client side of the same contract.
- [enumeration-safety](../enumeration-safety/README.md): cross-account resources answer as NOT_FOUND.
