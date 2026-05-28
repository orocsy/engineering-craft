# Cross-File Seams (operational catalog — MIRRORED, do not hand-edit)

**When this category bites**: a change is locally correct in the file you edited, but
contradicts another file's expectations at the seam between them — an env-var fallback,
a route prefix, an SDK option name, an event's transaction semantics, a mock vs the real
interface, a gate that couples unrelated effects, or a wrapper that drops the inner's
lifecycle. The unit test for the file passes; the bug lives at the boundary and surfaces
in production.

## Provenance — this is a generated mirror

The real content of this category (`FAILURE_MODES.md`) is a **read-only mirror**.

- **Canonical source**: the `dev-pipeline` plugin, at
  `skills/cross-file-reasoning/FAILURE_MODES.md`. That file lives in the plugin because
  the `cross-file-reasoning` skill reads it inline on every implement/review and appends
  to it live the moment a reviewer catches a new failure mode — it must be present with
  zero external dependency.
- **How it gets here**: `/dev-pipeline:consolidate-lessons` (Step 4.5) copies the
  canonical file into `FAILURE_MODES.md` in this directory, one-way, every run.
- **Do NOT hand-edit `FAILURE_MODES.md` in this directory** — the next consolidation
  overwrites it. To add or change a cross-file failure mode, edit the plugin's canonical
  file; the change mirrors here automatically.

This `README.md` (the category index you're reading) IS hand-authored and is not
regenerated — only its sibling `FAILURE_MODES.md` is.

## Relationship to the hand-authored categories

This catalog is the **operational seam check** — fast, general-form, read at trace time.
For the DEEPER treatment of adjacent topics, see the hand-authored categories, which
remain canonical for their own scope:

| Cross-file failure mode (operational) | Deeper hand-authored home |
|---|---|
| #2 empty-string env collapse (`??` vs `\|\|`) | [`config-drift`](../config-drift/README.md) — the full 4-consumer rule |
| #8/#9 single-place fix / removing load-bearing code | [`grep-for-siblings`](../grep-for-siblings/README.md) — the security-literal sweep |
| #4 conditional coupling (effect gated by unrelated condition) | [`silent-no-op-integrations`](../silent-no-op-integrations/README.md) |

One fact, one home: the operational seam check lives here (mirrored from the plugin);
the broad treatment lives in those categories. They cross-link; they don't duplicate.

## Contents

- [`FAILURE_MODES.md`](FAILURE_MODES.md) — the mirrored catalog of cross-file-seam
  failure modes (general-form Pattern + Anti-pattern + Correct + real Examples).
