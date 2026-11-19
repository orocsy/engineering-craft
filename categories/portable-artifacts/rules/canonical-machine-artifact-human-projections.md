---
title: Use a Canonical Machine Artifact; Treat Documents as Human Projections
type: decision
maturity: draft
impact: HIGH
impact-description: |
  A human-readable document cannot preserve every editable-system invariant.
  Reconstructing a graph or workflow from prose, especially through AI, changes
  IDs, positions, links, custom definitions and defaults while still looking
  plausible. That creates a silent handoff error rather than a visible import
  failure. The same gap opens when a person approves a report or PDF and a later
  step re-reads that document to act: what was approved and what is executed can
  differ by a parse error or a paraphrase, and nothing detects it.
tags: export, import, interchange, canonical-json, checksum, ai, documents, diagrams, approval, reports, pdf, agents
applies-to: |
  Any product that exports and re-imports editable workflows, diagrams,
  low-code designs, configurations or structured documents; any feature that
  publishes the same source into both machine and human-friendly formats; any
  flow where an agent or job produces a result, a person reviews a document made
  from it, and a later step acts on the approval (outreach copy, quotes, drafts,
  change plans, migration plans).
related-rules:
  - server-rederives-sensitive-classification
  - parse-dont-cast-at-trust-boundaries
  - immutable-revision-log-and-head-cas
historical-incidents:
  - "Private architecture-builder session (2026-08-01): a DOCX/AI handoff was proposed, then rejected for exact re-import after stable IDs, layout, relationships, custom definitions and viewport state proved lossy; deterministic versioned JSON plus SHA-256 and preflight passed byte-identical round-trip tests"
  - "a prospecting report (2026-11): the agent's result was first stored as rendered HTML next to the record it came from; in review the owner asked how the later sending step would stay consistent with what the reviewer saw, and the design changed to store the record once, render on demand, and have approval name the record's identifier"
last-referenced: 2026-11-17
---

## The incident progression

| Stage | What happened |
|-------|---------------|
| Intent | Let customers share a composed workflow with an internal team and also publish polished documents. |
| First approach | Treat DOCX or an AI-parsed design document as the import/export boundary. |
| Failure signal | Two parses can produce visually similar diagrams while changing node identity, layout, links and custom building blocks. There is no objective equality contract. |
| Correction | Define one deterministic machine artifact for exact exchange; generate documents and diagrams from it as read-only projections. |
| Verification | Unchanged exports were byte-identical; export-import-export preserved the complete editable state; tampering failed integrity validation; import required explicit preflight confirmation. |

The key distinction is not JSON versus DOCX. It is **canonical state versus a
projection of state**.

## Required contract layers

Keep these concerns separate:

1. **Domain schema version** — meaning of the editable payload.
2. **Transport format version** — shape of the exchange envelope.
3. **Canonical serialization** — recursively stable object-key order, explicit
   array-order semantics and no volatile fields in canonical bytes.
4. **Integrity** — digest of the canonical unsigned content.
5. **Authenticity** — a separate signature or authenticated share record when
   sender identity matters.
6. **Human projections** — DOCX, PDF, Markdown, Mermaid, images and briefs.
7. **Idea ingestion** — AI/document parsing that proposes reviewed changes; it
   never silently becomes the exact imported source.

## Incorrect

```ts
// A generated brief omits machine-only invariants.
const document = await renderProfessionalDoc(editableDesign);

// Later: probabilistic reconstruction is treated as an exact import.
const reconstructed = await model.parse(document);
replaceCurrentDesign(reconstructed);
```

This can neither prove equality nor distinguish an intentional edit from model
variance.

## Correct shape

```ts
type ExchangeArtifact<T> = {
  format: "vendor.product-artifact";
  formatVersion: 1;
  payload: T;
  integrity: { algorithm: "SHA-256"; digest: string };
};

const canonicalBytes = canonicalSerialize(unsignedArtifact);
const artifact = {
  ...unsignedArtifact,
  integrity: { algorithm: "SHA-256", digest: await sha256(canonicalBytes) },
};

const verified = await validateAndPreview(fileBytes);
if (verified.confirmed) replaceCurrentDesign(verified.payload);
```

The exact file is the editable handoff. Human outputs are derived from the
verified payload:

```ts
const brief = renderMarkdown(artifact.payload);
const diagram = renderMermaid(artifact.payload);
const professionalDoc = await renderDocument(artifact.payload);
```

## Approval acts on the record, not on its rendering

The same split applies when a person approves a document and a later step acts on it.
A report, PDF, email preview or chat summary is a rendering of a stored result:

1. **Persist the structured result first.** The agent's work product is a record with
   fields, stored where the next step can load it. It is written once and not edited.
2. **Render documents from the record, on demand.** Do not store the rendering as a
   second source; a stored rendering goes stale when the layout or a label changes.
3. **Give each record an identifier derived from its content** and print it in the
   document next to the part a person approves.
4. **Approval names the identifier.** The executing step loads that record and acts on
   its fields. It never opens the document.
5. **A new run makes a new record.** Re-doing the work does not overwrite the old
   result, so the two can be compared and an approval of the old one does not silently
   carry over to the new one. Keep both with their times and let the person choose.

Re-reading the document fails silently: PDF text extraction loses table structure,
reading order and non-Latin glyphs; a model told to "do what the report says"
paraphrases, so the sent text is close to, not equal to, the approved text; and the
document usually shows less than the record holds. The mismatch is found by the
recipient.

In review, ask: does any later step take a rendered artifact as input? If the stored
record is deleted, can the document still be produced (then the document has become a
source)? Does changing one word of the approved content change the identifier?

## Integrity is not authenticity

A checksum detects accidental changes or a payload edited without recomputing
the digest. Anyone able to rewrite the artifact can recompute an unsigned
checksum. Do not say “verified sender” unless the design also uses a signature
whose key is trusted, or an authenticated server record with recipient scope,
revocation and audit history.

## Tests

```ts
it("exports unchanged state to identical bytes", async () => {
  expect(await exportArtifact(design)).toEqual(await exportArtifact(design));
});

it("round-trips every editable invariant", async () => {
  const first = await exportArtifact(designWithCustomDefinitions);
  const imported = await importArtifact(first);
  expect(await exportArtifact(imported)).toEqual(first);
});

it("does not mutate the open design during preflight", async () => {
  await chooseImportFile(validArtifact);
  expect(currentDesign()).toEqual(originalDesign);
  await confirmImport();
  expect(currentDesign()).toEqual(importedDesign);
});
```

Also test:

- unsupported future transport versions fail closed;
- domain-version mismatch is distinct from transport-version mismatch;
- a one-field payload edit fails integrity validation;
- custom definitions travel with the instances that use them;
- workspace/profile boundaries cannot be silently converted;
- AI-generated proposals require human selection before canonical mutation;
- the step that acts on an approval loads the record by the approved identifier, and
  fails when the identifier does not match a stored record.

## Anti-patterns

- “The document looks the same” — visual similarity is not state equality.
- “AI can fill in whatever the export omitted” — that is synthesis, not import.
- “The payload already has a version” — transport evolution is independent.
- “Include `exportedAt` for traceability” — keep volatile metadata outside the
  canonical equality boundary.
- “Checksum means trusted” — integrity and authenticity are separate claims.
- “The agent will follow the approved report” — it will paraphrase it; hand it the record.
