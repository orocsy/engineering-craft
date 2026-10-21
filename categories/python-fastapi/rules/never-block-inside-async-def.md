---
title: Never Block Inside async def
maturity: draft
impact: HIGH
impact-description: |
  An `async def` route runs on the event loop's single thread. One blocking call
  (`time.sleep`, `requests.get`, a sync DB driver, heavy CPU work) freezes every
  in-flight request, health checks included, so a slow dependency becomes a full outage.
  It passes every unit test because tests send one request at a time.
tags: python, asyncio, fastapi, event-loop, performance, concurrency
applies-to: |
  FastAPI/Starlette/any asyncio service. Especially routes that call third-party SDKs,
  ORMs, file I/O or CPU-heavy code.
related-rules:
  - liveness-check-stays-closed
historical-incidents:
  - KidsBuddy MIU-B01 (2026-10): captured while choosing async def for routes and def for the app factory; recorded before the first DB or provider call lands
---

## The rule

| Work inside the handler | Declare the route as |
|---|---|
| Awaits async I/O only (`httpx.AsyncClient`, asyncpg, `asyncio.sleep`) | `async def` |
| Calls a blocking library you can't replace | plain `def`, which FastAPI runs in a thread pool |
| CPU-heavy (image processing, big parsing) | `def`, or offload to a worker or process pool |

In async code use `await asyncio.sleep(...)`, never `time.sleep(...)`. Wrap an
unavoidable blocking call with `await anyio.to_thread.run_sync(fn)`.

## Review trigger

A diff that adds `import requests`, `time.sleep`, a sync ORM session, or `open(...).read()`
of a large file inside an `async def` route.
