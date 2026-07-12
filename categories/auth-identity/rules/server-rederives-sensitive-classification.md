---
title: The server re-derives sensitive-field classification from its own schema — client structure is not enforcement
type: guideline
maturity: verified
impact: HIGH
impact-description: |
  When access-gating of sensitive data (medical, PII) depends on WHERE the
  data sits in a payload (a reserved sub-object, a naming convention), and
  the CLIENT is what puts it there, any direct API call bypasses the
  gating entirely. Role-restricted readers then see data the product
  promised to hide.
tags: pii, sensitive-data, validation, server-side, multi-tenant
applies-to: |
  Any write path where sensitive fields are gated downstream by payload
  STRUCTURE (nesting, prefixes, reserved keys) or by a classification the
  client asserts — intake forms, profile fields, notes, custom fields.
related-rules: []
historical-incidents:
  - "a real incident (MED, caught by whole-system review): intake answers were stored verbatim and the medical-answer nesting that the role-based projection depended on was applied only by the storefront client — a direct API call with a flat key exposed medical answers to an assistant-level roster read"
last-referenced: 2026-07-12
---

## Why this matters

Projections and role gates key on structure ("strip `answers.medical` for
non-owners"). If the client creates that structure, the gate is advisory.
The server must re-derive the classification from ITS OWN source of truth
(the schema/question definitions) at write time, inside the same tx that
persists the data.

## Correct shape

```ts
// ✅ Partition against the server's own typed definitions, in-tx,
// where the parent id is authoritative
const questions = await tx.intakeQuestion.findMany({ where: { offeringId } });
const { flat, sensitive, unknown } = partitionAnswers(dto.answers, questions);
if (unknown.length) throw new BadRequestException(...); // in-pattern with DTO whitelisting
persist({ ...flat, medical: sensitive });
```

## The stronger form

Prefer **structural omission** over strip-after-select: a projection that
never SELECTs the sensitive column cannot leak it through any later code
path. Strip-after-select fails open; omit fails closed.

## Honest residuals

Free-text fields can't be server-classified — document the residual
instead of pretending the gate covers it.

## Anti-patterns

- Trusting a client-supplied `isSensitive` flag or nesting.
- Classifying in middleware that only some routes pass through — put the
  partition where the authoritative parent id is resolved.
