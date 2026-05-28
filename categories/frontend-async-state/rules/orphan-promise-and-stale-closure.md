---
title: Frontend Async State — Orphan Promises, Stale Closures, Latched Init Effects
type: pitfall
maturity: verified
last-referenced: 2026-05-12
impact: HIGH
impact-description: |
  Async ops feeding component-local state across step/modal transitions don't carry
  their own request-id. Effects' dep arrays force a binary choice between "rerun on
  every change (lose user input)" and "never rerun (use stale data)." Fire-and-forget
  promises orphan their error/loading state. Three real production incidents.
tags: react, async, hooks, useeffect, race-condition, fire-and-forget
applies-to: |
  Any user-action mutation; any multi-step form; any modal that fires HTTP and then
  unmounts; any `useEffect(initFromServer, [serverData])` pattern; any slot/hold
  state cached across step transitions.
related-rules:
  - race-test-contract
historical-incidents:
  - startGoogleAuth was a fire-and-forget IIFE; outer promise resolved immediately, error banner showed but spinner stayed stuck on "Opening…" forever
  - race A→B→A on plan-change-modal; slow first-A resolved AFTER B mutate; closure tag still matched the ref; stale data populated
  - service-form effect gated init on staffLoading; broke ALL form initialization on slow connections (typing into Service Name was wiped when query resolved)
  - fix — split into two latched effects (user-input fields run once; server-derived defaults run on data ready)
  - slot-hold drift; stale slot key cached in component state across step transitions; expired holds slipped through
---

## Why this matters

React's mental model breaks down at three specific seams:

1. **Promise lifetime vs component lifetime.** A user clicks "Open checkout" → fire HTTP → component unmounts (modal closes) before HTTP resolves. The promise has nowhere to surface its result/error. The spinner state (in the now-unmounted parent) stays "Opening…" because the cleanup path never ran.

2. **Effect dep arrays force a binary choice.** `useEffect(initFromServer, [serverData])` runs every time `serverData` changes — wipes user input. Removing `serverData` from deps means the effect runs once with stale (initial) `serverData` — uses wrong values. Both options are wrong; the right answer is two effects with separate latches.

3. **Action sequence A→B→A** with closure-based "is this still the latest?" check breaks when both A's reference the same identity. Tag-based deduplication (`if (currentTag === myTag)`) is fooled because A and A share a tag.

## Incorrect — three real patterns

### Fire-and-forget IIFE

```typescript
// ❌ Outer caller has no .catch(); spinner stuck if error
const startGoogleAuth = () => {
  void (async () => {
    setLoading(true);
    try {
      const url = await api.startOAuthFlow();
      window.location.href = url;
    } catch (err) {
      setError(err.message); // ← shows banner but…
    }
    // ↑ NEVER setLoading(false) — spinner stays
  })();
};
```

### A→B→A race with tag matching

```typescript
// ❌ A→B→A: tag = id, both A's share id, race-loser wins
const handleClick = async (planId: string) => {
  setCurrentTag(planId);
  const result = await api.changePlan(planId);
  if (currentTag === planId) {
    setData(result); // ← stale A's result wins because A and A share tag
  }
};
```

### Effect re-runs wipe user input

```typescript
// ❌ User typing into Name field; server data resolves; effect re-runs and overwrites
useEffect(() => {
  if (!staffLoading && service) {
    setForm({
      name: service.name,           // ← overwrites user's typing
      defaultStaffIds: service.defaultStaffIds,
    });
  }
}, [staffLoading, service]); // ← runs every time `service` changes
```

## Correct

### Return promise; let caller await + handle final state

```typescript
// ✅ Promise reaches caller; spinner is the caller's responsibility
const startGoogleAuth = async () => {
  const url = await api.startOAuthFlow();
  window.location.href = url;
};

// At the call site:
const handleClick = async () => {
  setLoading(true);
  try {
    await startGoogleAuth();
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false); // ← always runs
  }
};
```

### Per-request monotonic counter (not tag matching)

```typescript
// ✅ Counter increments per click; only the LATEST request applies
const requestIdRef = useRef(0);

const handleClick = async (planId: string) => {
  const myRequestId = ++requestIdRef.current;
  const result = await api.changePlan(planId);
  if (myRequestId === requestIdRef.current) {
    setData(result); // ← only the most recent request wins
  }
};
```

### Two latched effects: user-input vs server-derived

```typescript
// ✅ Split init into "user-input fields (run once)" + "server-derived (run on data ready)"
const hasInitializedFormRef = useRef(false);
const hasInitializedDefaultsRef = useRef(false);

// Effect 1: user-input fields, run ONCE on first server data
useEffect(() => {
  if (!hasInitializedFormRef.current && service) {
    setForm({ name: service.name, description: service.description });
    hasInitializedFormRef.current = true;
  }
}, [service]);

// Effect 2: server-derived defaults, run when staff query resolves
useEffect(() => {
  if (!hasInitializedDefaultsRef.current && !staffLoading && service) {
    setDefaultStaffIds(service.defaultStaffIds);
    hasInitializedDefaultsRef.current = true;
  }
}, [staffLoading, service]);
```

### Step transitions invalidate-and-reacquire

```typescript
// ❌ Cache slot key across steps — stale by the time we reach confirm
const [slotKey, setSlotKey] = useState(initialKey);
// (slotKey survives step A → B → C; expired hold still tries to confirm)

// ✅ Reacquire on every step that depends on it
useEffect(() => {
  let cancelled = false;
  api.acquireSlotHold(serviceId).then((key) => {
    if (!cancelled) setSlotKey(key);
  });
  return () => {
    cancelled = true;
    if (slotKey) api.releaseSlotHold(slotKey);
  };
}, [step]); // ← re-runs on every step entry; releases on exit
```

## Tests

```typescript
// Race test for A→B→A (using fake timers)
it('A→B→A: only B applies, then A2 applies (most recent wins)', async () => {
  const responses = [
    delay(100, { plan: 'A1' }),  // A1 slow
    delay(50,  { plan: 'B'  }),   // B fast
    delay(10,  { plan: 'A2' }),  // A2 fastest, fires last
  ];
  let i = 0;
  api.changePlan.mockImplementation(() => responses[i++]);

  const { result } = renderHook(usePlanChange);
  result.current.handleClick('A');
  result.current.handleClick('B');
  result.current.handleClick('A');

  jest.advanceTimersByTime(200);
  await flush();

  expect(result.current.data.plan).toBe('A2'); // ← latest, not stale A1
});

// Latched-effect test
it('typing into name field is not wiped when server data resolves', async () => {
  const { result } = renderHook(useServiceForm, { service: undefined });
  result.current.setForm({ name: 'My typed value' });

  rerender({ service: { name: 'Server name', description: 'Server desc' } });
  expect(result.current.form.name).toBe('My typed value'); // ← preserved
});
```

## Anti-patterns

- `void asyncFn()` — caller can't catch
- Tag-matching with planId / requestId-as-string — A→B→A breaks
- Single `useEffect` for both user-input and server-derived state
- Caching slot/hold/lock keys across step transitions
- "I'll add a request-id later" — never happens; race ships

## References

- React 18 batching: https://react.dev/blog/2022/03/29/react-v18#new-feature-automatic-batching
- AbortController for cancelling in-flight: https://developer.mozilla.org/en-US/docs/Web/API/AbortController
