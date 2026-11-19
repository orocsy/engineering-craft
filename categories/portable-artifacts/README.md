# Portable Artifacts

**When this category bites**: a diagram, workflow, configuration or low-code
design is shared as a document, then another tool or AI is expected to recreate
the exact editable state. The result looks similar but silently loses stable
IDs, layout, custom definitions, relationships or version semantics.

**Source incident**: a private architecture-builder session first considered
DOCX and AI-parsed documents as the team handoff. Requiring exact customer-to-
team re-import exposed that prose is a projection, not a canonical state
transfer. The implemented contract used deterministic, versioned JSON with an
integrity digest and a preflight step. A later prospecting report hit the same
gap from the other side: the next step was going to act on the rendered report a
person approved, instead of on the stored record behind it.

## Bedrock rule

**Use one versioned machine artifact as the exact source of truth. Treat PDF,
DOCX, Markdown, Mermaid and AI-generated prose as human projections or idea
sources, never as lossless round-trip inputs — and never as the input a later step
acts on after a person approves them.**

## Rules

| Rule | Impact | Trigger |
|------|--------|---------|
| [canonical-machine-artifact-human-projections](rules/canonical-machine-artifact-human-projections.md) | HIGH | Export/import, shareable diagrams, low-code designs, AI document parsing, generated professional documents; a person approves a report/PDF/preview and a later step acts on it |

## Anti-patterns

- Re-importing a generated document and claiming the editable result is exact.
- Versioning the domain payload but not the transport wrapper.
- Adding export timestamps to canonical bytes and then expecting deterministic
  equality.
- Calling a checksum a signature or proof of authorship.
- Importing immediately on file selection without validation and preview.
- A sending or executing step that re-reads the approved PDF or summary instead of
  loading the record by its identifier.
