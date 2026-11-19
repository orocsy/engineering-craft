---
title: A `value`/`onChange` Contract Cannot Express "Not Yet" — So Async Children Must Add a Busy Channel
last-referenced: 2026-08-06
maturity: verified
type: guideline
impact: HIGH
impact-description: |
  The controlled-input contract was designed for synchronous edits: the parent holds the
  value, the child returns the next one, and at every instant the parent's copy is the
  truth. A child that does async work breaks that invariant — between "user acted" and
  "onChange fired" there is a third state the contract has no channel for, so the parent's
  Save commits a snapshot missing whatever had not resolved, and reports success.
tags: react, frontend, async, controlled-component, forms, upload, state
applies-to: |
  Any component exposing `{ value, onChange }` (or the framework equivalent: `v-model`,
  `bind:value`) whose event handlers `await` — file uploads, remote validation, geocoding,
  autocomplete that commits an id, image cropping, anything that resolves after the user
  has moved on.
related-rules:
  - orphan-promise-and-stale-closure
  - exhaustive-registry-beats-diff-review
historical-incidents:
  - a real review round: an admin form's Save committed while an inline image manager still
    had uploads in flight; the saved record captured only the ids that happened to have
    resolved. The child tracked `pending` in local state; its Props were exactly
    `{ value: string[]; onChange: (ids: string[]) => void }`.
---

## Why neither file looks wrong

The parent handles its own async correctly:

```tsx
<button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</button>
```

The child resolves correctly, and even guards against a stale snapshot:

```tsx
// valueRef so a slow upload appends to the CURRENT list, not the render-time one
const id = await uploadImage(file);
commit([...valueRef.current, id]);
```

Both are careful. **The seam is the defect**: `submitting` is the parent's own request
state, and `pending` is the child's local state, and nothing connects them. The parent
cannot wait for work it cannot see. That is why the bug survives review of either file
alone — you have to hold both prop contracts in your head at once.

## Incorrect

```tsx
interface Props {
  value: string[];
  onChange: (ids: string[]) => void;      // ❌ no channel for "in flight"
}

export function ImageManager({ value, onChange }: Props) {
  const [pending, setPending] = useState<Pending[]>([]);   // ❌ invisible to the parent
  async function handleFiles(files: FileList) {
    for (const file of files) {
      setPending((p) => [...p, { file }]);
      const id = await uploadImage(file);                  // user can hit Save right here
      onChange([...valueRef.current, id]);
    }
  }
}
```

## Correct

```tsx
interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  onBusyChange?: (busy: boolean) => void;   // ✅ the third state, lifted
}

export function ImageManager({ value, onChange, onBusyChange }: Props) {
  const [pending, setPending] = useState<Pending[]>([]);
  useEffect(() => { onBusyChange?.(pending.length > 0); }, [pending.length, onBusyChange]);
  …
}

// Parent — one busy registry, so N async children compose.
const [busyChildren, setBusyChildren] = useState<Set<string>>(new Set());
const childBusy = (key: string) => (busy: boolean) =>
  setBusyChildren((s) => { const n = new Set(s); busy ? n.add(key) : n.delete(key); return n; });

<ImageManager value={images} onChange={setImages} onBusyChange={childBusy('images')} />
<button type="submit" disabled={submitting || busyChildren.size > 0}>
  {busyChildren.size > 0 ? 'Waiting for uploads…' : 'Save'}
</button>
```

Disabling Save is the floor, not the ceiling. Better still, make the commit *await* the
in-flight set, so a user who hits Enter gets a completed save rather than a dead button.

## The general form

> When a component's public contract encodes only the states the ORIGINAL design had, and
> you add a state the design never had, extend the contract — do not keep the new state
> private and hope callers do not act during it.

The same shape recurs beyond forms: a child that can *fail* needs an error channel, not a
private error toast; a child that can be *partially valid* needs a validity channel, not a
silent refusal to call `onChange`.

## Tests

```typescript
it('Save is disabled while a child upload is in flight', async () => {
  let resolveUpload: (id: string) => void;
  uploadImage.mockReturnValue(new Promise((r) => { resolveUpload = r; }));

  render(<RecordForm />);
  await userEvent.upload(screen.getByLabelText('Images'), file);

  expect(screen.getByRole('button', { name: /save|waiting/i })).toBeDisabled();
  resolveUpload!('img_1');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
});

it('a save issued during an upload includes the uploaded id', async () => { … });
```

## Executable gate

[`async-child-busy-contract.template.mjs`](../../../templates/async-child-busy-contract.template.mjs)
— flags any component whose props are a `value` + `on*` pair, whose body awaits, and whose
props declare no busy channel. Narrow by construction: across four repos it reported two
components, both true positives.

## See also

- [orphan-promise-and-stale-closure](orphan-promise-and-stale-closure.md) — the same async/render seam, one layer in
