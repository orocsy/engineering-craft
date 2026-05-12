---
title: Frontend Payload Shape Drift Against `forbidNonWhitelisted: true` DTO
type: pitfall
maturity: verified
last-referenced: 2026-05-12
impact: HIGH
impact-description: |
  Backend has `ValidationPipe({ forbidNonWhitelisted: true })`. Frontend forms
  accumulate UI-only state, derived values, or legacy server values that round-trip.
  Any payload key the DTO doesn't accept = 400. Regex tightenings on existing fields
  silently break old persisted values.
tags: dto, payload, validation, nestjs, regex, forbidnonwhitelisted
applies-to: |
  Every form submit; every API client function; every regex/format tightening on
  an existing DTO field that may have legacy persisted values.
related-rules:
  - api-rename-cross-cut-grep
  - libs-first-no-reinventing
historical-incidents:
  - 88c416d — replace_all from @IsObject → @IsValidWorkingHours missed UpdateWorkingHoursDto AND removed @IsObject from imports; TS2552 build failure on main
  - ed085cb — admin Save forwarded unchanged legacy logoUrl on every color save; new strict regex DTO rejected the round-tripped legacy value with 400; color-only saves broken
  - aa5f3ee — logoUrl regex with capture group `https?:\/\/[^\s\/]+)?\/uploads\/...` accepted ANY hostname; SSRF/tracking-pixel vector (Codex P1)
---

## Why this matters

The backend DTO contract is "every property is whitelisted; unknown properties are
400." This is correct security posture but creates two sharp edges for the
frontend:

1. **UI-only fields leaking into payload.** The form holds `isDirty`, `_originalValue`,
   `_displayMode`, derived totals, etc. If the submit handler does
   `api.update({ ...formState })`, every UI-only key reaches the DTO and triggers a 400.

2. **Legacy values round-tripping.** GET returns `{ logoUrl: 'http://old-cdn/logo.png' }`.
   User saves only colors. Frontend sends back the entire form including the legacy
   `logoUrl`. Backend has tightened the validator to require `/uploads/` prefix.
   Validator rejects the round-tripped legacy value. User sees "Save failed" on a
   change they didn't make.

3. **Regex tightenings without migration.** Tightening `/uploads/.*` to
   `/uploads/[a-z0-9-]+\.(png|jpg|webp)$` rejects every legacy persisted value that
   was set before the tightening. Worse: a regex with optional capture groups (e.g.
   `https?://([^/]+)?/uploads/...`) accepts ANY hostname — SSRF vector.

## Required reflexes

### `toApiPayload()` typed against DTO

```typescript
// ❌ Spreading the entire form state — leaks UI-only fields
async function onSubmit(formState: ServiceFormState) {
  await api.updateService(serviceId, { ...formState });
  //                                    ^^^^^^^^^^^^^ may include _isDirty, _originalValue, etc.
}

// ✅ Pick<> against generated DTO — TS errors on unknown keys
import type { UpdateServiceDto } from '@/api-types/generated';

function toApiPayload(formState: ServiceFormState): UpdateServiceDto {
  return {
    name: formState.name,
    description: formState.description,
    durationMinutes: formState.durationMinutes,
    // TS error if you try to add formState._isDirty here
  };
}

async function onSubmit(formState: ServiceFormState) {
  await api.updateService(serviceId, toApiPayload(formState));
}
```

### Don't round-trip server values

```typescript
// ❌ GET → user edits one field → PUT including everything (incl. legacy logoUrl)
async function onColorSave(colors: BrandingColors, server: ServerBranding) {
  await api.updateBranding({ ...server, ...colors });
  //                          ^^^^^^^^^^ logoUrl from server may fail new regex
}

// ✅ Only send the fields the user actually changed
async function onColorSave(colors: BrandingColors) {
  await api.updateBranding(colors); // PATCH semantics: partial update
}
```

For PATCH endpoints, send only changed fields. For PUT endpoints (full replacement),
the DTO should accept the legacy shape on read OR the migration should have run
before the validator tightened.

### Tightening regex requires migration audit

When you change a validator from "loose" to "strict":

1. **Audit existing values**:
```sql
SELECT id, logoUrl FROM Tenant WHERE logoUrl IS NOT NULL;
-- Verify every value matches the new regex
```

2. **Plan one of three responses**:
   - **Migrate**: one-shot script to canonicalize old values
   - **Accept legacy on read**: dual validator (loose for incoming legacy, strict for new)
   - **Roll back**: if migration is too risky, don't tighten

3. **Never**: ship the tightened validator and discover at the first PATCH that
   the legacy value fails. Your most active users get the breakage.

### URL fields use `URL.origin` allowlist, not regex

```typescript
// ❌ Regex with optional capture; accepts arbitrary hosts
const LOGO_URL = /^(https?:\/\/[^\s\/]+)?\/uploads\/[a-z0-9-]+\.(png|jpg)$/i;
// "https://attacker.com/uploads/x.png" → MATCHES (capture group is optional)

// ✅ Parse + allowlist
const ALLOWED_ORIGINS = ['https://cdn.luxe-book.com', process.env.MEDIA_PUBLIC_URL];
function isValidLogoUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return ALLOWED_ORIGINS.includes(url.origin) && url.pathname.startsWith('/uploads/');
  } catch {
    return false;
  }
}
```

URL parsing is a SOLVED problem ([libs-first-no-reinventing](../../library-choice/rules/libs-first-no-reinventing.md)). Never hand-roll a URL regex.

## Tests

```typescript
describe('UpdateServiceDto whitelist', () => {
  it('rejects unknown properties (forbidNonWhitelisted)', async () => {
    const resp = await request(app)
      .patch('/services/123')
      .send({ name: 'X', _isDirty: true });
    expect(resp.status).toBe(400);
    expect(resp.body.message).toContain('property _isDirty should not exist');
  });

  it('accepts a payload built by toApiPayload(formState)', async () => {
    const formState: ServiceFormState = createFormState({ _isDirty: true });
    const payload = toApiPayload(formState);
    expect(payload).not.toHaveProperty('_isDirty');
    const resp = await request(app).patch('/services/123').send(payload);
    expect(resp.status).toBe(200);
  });
});

describe('logoUrl validator (after tightening)', () => {
  it.each([
    'https://cdn.luxe-book.com/uploads/abc.png',
    'https://cdn.luxe-book.com/uploads/xyz-123.webp',
  ])('accepts canonical: %s', (url) => {
    expect(isValidLogoUrl(url)).toBe(true);
  });

  it.each([
    'https://attacker.com/uploads/x.png', // wrong host
    'http://cdn.luxe-book.com/uploads/x.png', // wrong scheme
    'https://cdn.luxe-book.com/x.png', // wrong path
    '/uploads/x.png', // relative
  ])('rejects: %s', (url) => {
    expect(isValidLogoUrl(url)).toBe(false);
  });
});
```

## Anti-patterns

- `api.update({ ...formState })` — spreads UI-only fields
- `api.update({ ...server, ...changes })` — round-trips legacy values
- Regex with optional capture groups for URLs — accepts attacker hosts
- Tightening validator without migration plan — most active users break first
- Hand-rolled URL regex when `new URL()` exists
