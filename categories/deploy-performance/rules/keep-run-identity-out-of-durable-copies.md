# Keep per-run identity out of large durable copies; reuse stable parts by content

**Category**: deploy-performance
**First seen**: 2026-11-12 in `channel` (#84)
**Risk**: P1 — a copy that differs every run is re-uploaded whole every run, and a careless "reuse" weakens the rollback it exists for

## The Lesson

A recovery copy of the release (83 MB) was content-addressed, which looked like it
should deduplicate, but two tiny per-run files (the run's manifest with its time and
the commit) travelled inside the one ZIP, so its hash changed on every deploy and all
83 MB crossed a slow link each time. Across three deploys nothing else had changed.
Splitting the per-run files into a small head and the rest into content-addressed parts
turned the per-deploy upload into the head alone (~111 KB).

## Why It Happens

Content addressing is applied to the container, not to what changes. The per-run fields
look harmless because they are small, and nobody diffs two consecutive copies.

## The Fix

- Diff two consecutive copies file by file before designing anything; list what changes
  on a run with no real change.
- Put the run's identity in a small head. Plan the rest deterministically from the
  manifest: large files alone, the rest in packs by a hash of the path (a bounded object
  count keeps restores and checks cheap; one object per file costs a call each).
- Key reuse on a content id: the hash of the part's sorted member list where every member
  is `[path, size, content hash]`, not on archive bytes, so a compressor update does not
  invalidate everything. Names alone are not enough: a file whose content changed at the
  same path would reuse the old, stale part.
- Reuse a stored part only with proof: its size and version tag (ETag) equal those
  recorded when it was last fully read back; otherwise read it in full, and upload it again
  if absent. That proves the stored part is intact; the content id is what proves it holds
  this release's bytes. Restore checks every part holds exactly its planned members, sizes
  and hashes.
- Shared parts make deletion dangerous: any cleanup must count references across every
  record first. Store new-format records under a key that old code cannot misread, so a
  revert falls back instead of failing.

## Examples

- 2026-11-12 (`channel` #84) — 1,810 files split into a head, 9 large files and 32 packs
  (42 objects). The first new-format deploy uploaded all 83 MB in 98 s (8 parts in flight)
  instead of 143–255 s as one multipart object. The next deploy read the whole new-format
  copy back in 13.7 s (the same as the old single object) and saved its own copy by
  uploading only the 111 KB head and reusing 41 objects: 5.1 s instead of 4.5 min. The site
  delivery step went from 8.7 to 2.9 minutes.
