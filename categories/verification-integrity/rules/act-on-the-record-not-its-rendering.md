---
title: Act on the Stored Record, Never on Its Rendered Document
last-referenced: 2026-11-17
maturity: draft
type: guideline
impact: HIGH
impact-description: |
  A report, PDF, email preview or chat summary is a rendering of some result. When the
  next step re-reads the rendering to decide what to do — parsing the PDF, scraping the
  summary, asking a model to "follow the report" — the thing a person approved and the
  thing that gets executed can differ by a parse error, a truncated table or a model's
  paraphrase, and nothing detects it.
tags: approval, reports, pdf, persistence, agents, handoff, provenance
applies-to: |
  Any flow where an agent or job produces a result, a person reviews a document made from
  it, and a later step acts on the approval: outreach copy, quotes, drafts, change plans,
  research findings, migration plans.
related-rules:
  - parse-dont-cast-at-trust-boundaries
  - probe-must-fail-on-injected-defect
historical-incidents:
  - a prospecting report was first stored as rendered HTML next to the result it came from; the owner asked how the later sending step would stay consistent with what the reviewer saw
---

## The rule

1. **Persist the structured result first.** The agent's work product is a record with
   fields, stored where the next step can load it. It is written once and not edited.
2. **Render documents from the record, on demand.** The PDF or page is a view. Do not
   store the rendering as a second source; a stored rendering goes stale the moment the
   layout or the wording of a label changes.
3. **Give each record an identifier derived from its content** and print it in the
   document next to the part a person approves.
4. **Approval names the identifier.** The executing step loads that record and acts on
   its fields. It never opens the document.
5. **A new run makes a new record.** Re-doing the work does not overwrite the old
   result; the two can be compared, and an approval of the old one does not silently
   carry over to the new one.

## Why re-reading the document fails

- Text extraction from PDFs loses table structure, reading order and non-Latin glyphs.
- A model asked to "do what the report says" paraphrases. The sent text is then close
  to, not equal to, the approved text.
- The document usually shows less than the record holds (clipped lists, shortened
  quotes), so anything rebuilt from it is missing fields.
- None of these raise an error. The mismatch is found by the recipient.

## What to check in review

- Is there any code path where a later step takes a rendered artifact as input?
- If the stored result is deleted, can the document still be produced? If yes, the
  document has become a source.
- Does changing one word of the approved content change the identifier?
- Can a result stored before a layout change still be rendered with the new layout
  without re-running the work?

## When the result should not be frozen

Freezing a record is about what was approved, not about refusing better information.
If a later run may be better (a model call, a re-crawl), keep both records with their
times and let the person choose; do not update in place.
