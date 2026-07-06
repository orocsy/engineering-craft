# Frontend Async State

**When this category bites**: a click sequence A→B→A returns A's data; an effect overwrites user input on slow connections; a fire-and-forget IIFE leaves a spinner stuck on "Opening…" forever.

**Source incidents**: 3-4 commits.

## Bedrock rule

**Async ops feeding component-local state across step/modal transitions don't carry their own request-id. Effects' dep arrays force a binary choice between "rerun on every change (lose user input)" and "never rerun (use stale data)." Fire-and-forget promises orphan their error/loading state.**

## Rules

| Rule | Impact | Trigger |
|------|--------|---------|
| [orphan-promise-and-stale-closure](rules/orphan-promise-and-stale-closure.md) | HIGH | Any user-action mutation, any multi-step form, any modal that fires HTTP and then unmounts |
| [web-storage-is-fallible](rules/web-storage-is-fallible.md) | HIGH | Any direct sessionStorage/localStorage access that can run inside an embedded webview (WeChat, Instagram) or strict-privacy context |

## Anti-patterns

- `void startGoogleAuth()` (fire-and-forget) — caller can't `.catch()` the error
- A→B→A race resolved by tag matching (string equality) — A→B→A breaks the tag
- `useEffect(initFromServer, [serverData])` — runs every server-data change, wipes user input
- Caching slot-hold key in component state across step transitions — expired holds slip through

## Related

- [concurrency-cas/race-test-contract](../concurrency-cas/rules/race-test-contract.md) — frontend races also need `Promise.allSettled` test patterns
