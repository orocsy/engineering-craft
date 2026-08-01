# Frontend Async State

**When this category bites**: a click sequence A→B→A returns A's data; an effect overwrites user input on slow connections; a fire-and-forget IIFE leaves a spinner stuck on "Opening…" forever; or a slow first navigation completes after the user chose a different destination.

**Source incidents**: 4+ incidents across independent projects.

## Bedrock rule

**Async ops feeding component-local state across step/modal/navigation transitions need an explicit latest-intent owner. Effects' dep arrays force a binary choice between "rerun on every change (lose user input)" and "never rerun (use stale data)." Fire-and-forget promises and route transitions can outlive the intent that started them.**

## Rules

| Rule | Impact | Trigger |
|------|--------|---------|
| [orphan-promise-and-stale-closure](rules/orphan-promise-and-stale-closure.md) | HIGH | Any user-action mutation, multi-step form, modal HTTP request, or navigation that can be superseded while loading |
| [web-storage-is-fallible](rules/web-storage-is-fallible.md) | HIGH | Any direct sessionStorage/localStorage access that can run inside an embedded webview (WeChat, Instagram) or strict-privacy context |

## Anti-patterns

- `void startGoogleAuth()` (fire-and-forget) — caller can't `.catch()` the error
- A→B→A race resolved by tag matching (string equality) — A→B→A breaks the tag
- `useEffect(initFromServer, [serverData])` — runs every server-data change, wipes user input
- Caching slot-hold key in component state across step transitions — expired holds slip through
- Clearing a route spinner after a second click while leaving the first transition in flight

## Related

- [concurrency-cas/race-test-contract](../concurrency-cas/rules/race-test-contract.md) — frontend races also need `Promise.allSettled` test patterns
