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
| [controlled-input-hides-async-work](rules/controlled-input-hides-async-work.md) | HIGH | A component exposing `value` + `onChange` whose handlers `await` — upload, remote validation, geocode, autocomplete that commits an id |
| [server-field-errors-reach-a-visible-input](rules/server-field-errors-reach-a-visible-input.md) | MEDIUM | A form that shows/hides inputs from client state and submits to a server that decides which fields are required |

## Templates

- [async-child-busy-contract.template.mjs](../../templates/async-child-busy-contract.template.mjs)

## Anti-patterns

- `void startGoogleAuth()` (fire-and-forget) — caller can't `.catch()` the error
- A→B→A race resolved by tag matching (string equality) — A→B→A breaks the tag
- `useEffect(initFromServer, [serverData])` — runs every server-data change, wipes user input
- Caching slot-hold key in component state across step transitions — expired holds slip through
- A child that awaits but only exposes `value`/`onChange` — the parent cannot see "in flight" and commits a partial value
- Clearing a route spinner after a second click while leaving the first transition in flight

## Related

- [concurrency-cas/race-test-contract](../concurrency-cas/rules/race-test-contract.md) — frontend races also need `Promise.allSettled` test patterns
