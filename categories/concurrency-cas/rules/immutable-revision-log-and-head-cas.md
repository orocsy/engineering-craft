---
title: Collaborative Documents Need Immutable Revisions Plus a Head CAS
type: decision
maturity: verified
impact: CRITICAL
impact-description: |
  A mutable shared-document row turns concurrent saves into last-writer-wins
  data loss. Presence indicators and client-side dirty flags make the race more
  visible but do not prevent it. A stale writer must receive a conflict while
  its working copy remains recoverable.
tags: collaboration, revisions, optimistic-concurrency, cas, immutable-history, fork, presence
applies-to: |
  Shared diagrams, workflows, documents, low-code canvases and configuration
  editors where multiple people can open the same version and save complete
  snapshots.
related-rules:
  - storage-gate-not-js
  - race-test-contract
  - state-machine-first
historical-incidents:
  - "Private collaborative-builder session (2026-08-01): two isolated browser users edited revision 1; the first save created revision 2, the stale save returned 409 without overwrite, and a fork preserved the losing working copy while the source project remained unchanged"
last-referenced: 2026-08-01
---

## The incident progression

| Stage | What happened |
|-------|---------------|
| Intent | Add Figma-like team visibility, history, deleted-item views and personal forks to an existing browser-local editor. |
| Naive shape rejected | Store one mutable document and let clients poll it; use presence to indicate who is editing. |
| Failure mode | Two users open head 8, both save “revision 9,” and the later request silently replaces the earlier work. Presence is advisory and cannot arbitrate. |
| Correction | Append immutable full snapshots and move a single head pointer only when it still equals the writer's expected revision. |
| Recovery | Keep the stale browser working copy untouched; offer open-latest or fork-from-base rather than invisible merge. |

## State model

Use separate durable and ephemeral records:

| Record | Mutable? | Purpose |
|--------|----------|---------|
| Revision `(project_id, revision)` | No | Exact accepted snapshot, author, parent and server-computed change set |
| Project head | Yes, by CAS only | Points to the latest accepted revision |
| Membership | Yes, authorized writes | Determines read/write role independently from sign-in |
| Presence | Yes, expiring/advisory | Recent actor and selection; never a lock |
| Browser working copy | Yes, local | Unsaved work and conflict recovery |
| Fork lineage | No after creation | Records the accessible project/revision copied into the new project |

Deleted-item visualization belongs to the comparison between immutable
snapshots. A tombstone is a history projection, not a deleted node resurrected
inside the canonical live document.

## Incorrect

```ts
const current = await db.project.find(projectId);
if (current.version !== expectedVersion) throw conflict();

// The check and write are separate. Another writer can commit between them.
await db.project.update(projectId, { document: nextDocument, version: expectedVersion + 1 });
```

Adding a presence lock in JavaScript does not close this race. Tabs crash,
heartbeats expire and network partitions make advisory locks stale.

## Correct storage shape

Use a transaction or storage primitive that makes the immutable append and
head move one atomic outcome:

```sql
INSERT INTO document_revisions
  (project_id, revision, parent_revision, snapshot_json, change_json)
VALUES
  (:projectId, :expected + 1, :expected, :snapshot, :changeSet);

UPDATE projects
SET head_revision = :expected + 1
WHERE id = :projectId
  AND head_revision = :expected;
```

The storage contract is:

```ts
if (headUpdateCount !== 1) {
  rollbackRevisionAppend();
  throw conflict({ currentHead });
}
```

A unique `(project_id, revision)` constraint is defense-in-depth. The expected-
head predicate is the user-facing arbitration rule. The append and pointer move
must commit or roll back together.

## Why full snapshots can be the right first design

For small structured documents, full snapshots simplify:

- exact historical rendering;
- deterministic forks;
- server-computed diffs;
- tombstone projections;
- recovery without replaying a partial event log.

This is revision-based collaboration, not simultaneous CRDT editing. Move to
operations/CRDTs only when the product truly requires character- or gesture-
level concurrent merging and has a durable realtime coordinator. Do not adopt
that complexity merely to display presence.

## Live test contract

Unit tests that mock the database are necessary but insufficient. Exercise the
public browser/API boundary with isolated identities:

1. User A creates revision 1 and invites User B.
2. Both load revision 1 and make different edits.
3. A saves and observes revision 2.
4. B submits `expectedRevision: 1`.
5. Assert B receives `409`, A's revision 2 remains unchanged and B's working
   copy still exists.
6. Fork B's working copy and assert the new project has independent ownership,
   lineage and exact content.
7. Assert a non-member cannot read the source and an editor cannot perform an
   owner-only mutation.

```ts
const [first, stale] = await Promise.allSettled([
  saveAs(userA, { expectedRevision: 1, document: a }),
  saveAs(userB, { expectedRevision: 1, document: b }),
]);

expect(accepted(first, stale)).toHaveLength(1);
expect(conflicts(first, stale)).toHaveLength(1);
expect(await loadHead()).toMatchOneOf([a, b]);
```

## Anti-patterns

- “Presence shows who is editing” — presence does not serialize saves.
- “We use a transaction” — a transaction without a head predicate can still
  encode last-writer-wins.
- “Merge the JSON automatically” — graph identity and business semantics make
  a syntactic merge unsafe unless the product defines conflict rules.
- “Put deleted nodes in the live document with a flag” — history presentation
  should not pollute current canonical state.
- “Reload on conflict” — never destroy the losing working copy before offering
  recovery or fork.
