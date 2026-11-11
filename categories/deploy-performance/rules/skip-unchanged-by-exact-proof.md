# Skip an unchanged artifact only on exact proof; any doubt deploys as before

**Category**: deploy-performance
**First seen**: 2026-11-05 in `channel` (#75)
**Risk**: P0 if done loosely — a skipped deploy that was not equal is a silent rollback

## The Lesson

Every function bundle had its commit and build time compiled in, so "unchanged" bundles
always differed and every deploy re-uploaded every function. Moving the stamp out of
the code would have broken recovery, which reads it as the code's identity. The safe
skip keeps the stamp and proves equality instead: replace the new stamp with the
running one and require byte equality with the package that is actually running
(saved by the pre-deploy backup). Every file, the file set, and the stamp's presence
must match; any error, missing backup or malformed stamp means upload.

The kept function then honestly reports the older build. Add a second, runtime-only
marker naming the deploy that confirmed it, and make the function report that marker
only while its running build is the one the deploy confirmed — so code replaced by
any other path stops claiming that deploy.

## Why It Happens

Content hashes of build outputs are polluted by build stamps; "compare source hashes"
skips the bundler and dependency changes it cannot see.

## The Fix

- Fix the stamp per run (e.g. build time = commit time) so the deploy knows it.
- Prove: `restamp(new) === running` byte for byte, all files; else upload.
- Keep a force switch (`…_FORCE_…=1`) that always uploads.
- Tell downstream checks which functions kept an older build (a manifest file), and
  confirm the kept build still serves under the new configuration before finishing.

## Examples

- 2026-11-05 (`channel` #75) — two local builds with different stamps were proven
  identical; the bundler output differed only in the two stamp literals.
