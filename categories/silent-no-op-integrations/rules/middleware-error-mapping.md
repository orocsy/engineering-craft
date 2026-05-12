---
title: Every npm Middleware That Throws Non-HttpException Errors Needs a Domain Filter
type: process
maturity: verified
last-referenced: 2026-05-12
impact: MEDIUM
impact-description: |
  Multer's LIMIT_FILE_SIZE / LIMIT_UNEXPECTED_FILE aren't HttpExceptions. NestJS's
  default exception filter renders them as 500. Admin UI shows "server error" for
  user-recoverable upload problems. User can't tell if it's their fault (file too
  big) or our fault.
tags: middleware, nestjs, exception-filter, multer, http-mapping
applies-to: |
  Every npm-installed middleware (multer, helmet, csurf, passport strategies, body
  parsers) that may throw errors not derived from HttpException.
related-rules:
  - configured-state-visible
  - required-variant-for-security
historical-incidents:
  - fc5b2ee — multer file-size limit returned 500 instead of 413; admin UI showed "server error"
  - e3205af — multer file-type validation returned 500 instead of 400
---

## Why this matters

NestJS's default exception filter has special handling for `HttpException` and
its subclasses (`BadRequestException`, `NotFoundException`, etc.). Anything else
becomes 500 with body `{ statusCode: 500, message: "Internal server error" }`.

Most npm middleware predates NestJS or is framework-agnostic. They throw their
own error classes:
- Multer: `MulterError` with `code: 'LIMIT_FILE_SIZE' | 'LIMIT_UNEXPECTED_FILE' | ...`
- Express body-parser: `entity.too.large`
- Passport: `AuthenticationError`
- csurf: `EBADCSRFTOKEN`

These reach the default filter as 500s. The user-facing impact:
- Upload too big → 500 "server error" instead of 413 "file too large, max 5MB"
- Wrong file type → 500 instead of 400 "only PNG/JPG accepted"
- Missing CSRF token → 500 instead of 403 "session expired, please refresh"

The user can't recover because the error message doesn't tell them what to do.

## The reflex

For every middleware you install, ask: "What errors does it throw, and what HTTP
status do they map to?" If the answer isn't "HttpException subclasses," write a
filter.

## Multer example

```typescript
// apps/api/src/common/filters/multer-exception.filter.ts
import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  PayloadTooLargeException,
} from '@nestjs/common';
import { MulterError } from 'multer';
import { Response } from 'express';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(error: MulterError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    const mapped = this.map(error);
    response.status(mapped.getStatus()).json({
      statusCode: mapped.getStatus(),
      message: mapped.message,
      code: error.code, // include for client-side recovery logic
    });
  }

  private map(error: MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return new PayloadTooLargeException(
          `File too large. Maximum size is 5MB.`,
        );
      case 'LIMIT_UNEXPECTED_FILE':
        return new BadRequestException(
          `Unexpected file field "${error.field}". Only single-file uploads are allowed.`,
        );
      case 'LIMIT_FILE_COUNT':
        return new BadRequestException(`Too many files. Maximum 1 per request.`);
      default:
        return new BadRequestException(error.message);
    }
  }
}
```

Register globally OR per-controller:

```typescript
// app.module.ts (global)
{
  provide: APP_FILTER,
  useClass: MulterExceptionFilter,
}

// OR per-controller
@UseFilters(MulterExceptionFilter)
@Controller('uploads')
class UploadsController { … }
```

## Tests

```typescript
describe('MulterExceptionFilter', () => {
  it('maps LIMIT_FILE_SIZE to 413', async () => {
    const buf = Buffer.alloc(10 * 1024 * 1024); // 10MB > 5MB limit
    const resp = await request(app)
      .post('/uploads')
      .attach('file', buf, 'big.png');
    expect(resp.status).toBe(413);
    expect(resp.body.message).toContain('5MB');
    expect(resp.body.code).toBe('LIMIT_FILE_SIZE');
  });

  it('maps LIMIT_UNEXPECTED_FILE to 400', async () => {
    const resp = await request(app)
      .post('/uploads')
      .field('extra', 'value');
    expect(resp.status).toBe(400);
    expect(resp.body.code).toBe('LIMIT_UNEXPECTED_FILE');
  });
});
```

Run BEFORE the integration ships. Don't wait for a user to report "server error
when uploading."

## Audit checklist for any new middleware

- [ ] Read the middleware's error classes (often documented as a table)
- [ ] For each error code, decide the right HTTP status (400 / 403 / 413 / 415 / 422)
- [ ] Write a `@Catch(SpecificError)` filter that maps codes to HttpException subclasses
- [ ] Include `code` in the response body so frontend can pattern-match for recovery UI
- [ ] Write a test per error code

## Anti-patterns

- Letting middleware errors fall through to the default 500 filter
- Mapping ALL middleware errors to 400 — loses the recoverable distinction
- Writing the filter "later" — never happens; user files the bug first
- Filter exists but doesn't include `error.code` in the response — frontend can't
  pattern-match
