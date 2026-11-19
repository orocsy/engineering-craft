# Portable Artifacts

**When this category bites**: a diagram, workflow, configuration or low-code
design is shared as a document, then another tool or AI is expected to recreate
the exact editable state. The result looks similar but silently loses stable
IDs, layout, custom definitions, relationships or version semantics.

**Source incident**: a private architecture-builder session first considered
DOCX and AI-parsed documents as the team handoff. Requiring exact customer-to-
team re-import exposed that prose is a projection, not a canonical state
transfer. The implemented contract used deterministic, versioned JSON with an
integrity digest and a preflight step.

## Bedrock rule

**Use one versioned machine artifact as the exact source of truth. Treat PDF,
DOCX, Markdown, Mermaid and AI-generated prose as human projections or idea
sources, never as lossless round-trip inputs.**

## Rules

| Rule | Impact | Trigger |
|------|--------|---------|
| [canonical-machine-artifact-human-projections](rules/canonical-machine-artifact-human-projections.md) | HIGH | Export/import, shareable diagrams, low-code designs, AI document parsing, generated professional documents |

## Anti-patterns

- Re-importing a generated document and claiming the editable result is exact.
- Versioning the domain payload but not the transport wrapper.
- Adding export timestamps to canonical bytes and then expecting deterministic
  equality.
- Calling a checksum a signature or proof of authorship.
- Importing immediately on file selection without validation and preview.
