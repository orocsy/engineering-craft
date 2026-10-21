---
title: Build the App in a Factory — Never at Import Time
maturity: draft
impact: HIGH
impact-description: |
  A module-level `app = FastAPI()` is created as a side effect of the first import and
  shared by every importer. Tests then mutate one global (overrides, extra routes,
  settings), and production-only wiring such as "no session verifier configured → reject
  everyone" can only be tested by patching that global. The usual result is a "test mode"
  flag in production code, which is a backdoor waiting to be enabled.
tags: python, fastapi, starlette, app-factory, testing, dependency-injection, security
applies-to: |
  Any ASGI/WSGI service (FastAPI, Starlette, Flask, Litestar) whose tests need different
  wiring from production, or whose dependencies (verifiers, clients, settings) should be
  injected rather than imported.
related-rules:
  - override-every-default-error-path
  - validate-responses-against-the-contract-file
historical-incidents:
  - KidsBuddy MIU-B01 (2026-10): the identity boundary had to reject every request in normal runs while tests needed synthetic sessions; a factory plus per-instance dependency_overrides gave both without any test switch in backend code
---

## The rule

```python
def create_app(settings: ApiSettings | None = None) -> FastAPI:
    settings = settings or ApiSettings.from_env()
    app = FastAPI(docs_url="/docs" if settings.expose_api_docs else None, ...)
    install_request_id(app)
    install_error_handlers(app)
    app.include_router(health_router)
    return app
```

Run it with `uvicorn pkg.api.app:create_app --factory`. Every caller (the server, each
test, a REPL) gets an independent, fully wired instance.

## Why

| | Module-level `app` | `create_app()` |
|---|---|---|
| Created | as an import side effect | when called |
| Tests | share and mutate one object | each builds a clean app |
| Test-only routes | leak into production or need cleanup | added to the test's own instance |
| Swapping a dependency | patch a global | `app.dependency_overrides[...]` on that instance, or pass it in |

## Checks

- A test asserts `create_app() is not create_app()` and that a fresh app has
  `dependency_overrides == {}`.
- A test scans backend source for test-fake names (`Fake…`, synthetic IDs,
  `dependency_overrides[`) so test identities can never be wired from production code.
