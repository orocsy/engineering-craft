/**
 * Enumeration test suite template — status + timing + outage-parity tests for any
 * forgot-password style endpoint that must NOT leak account existence.
 *
 * For background, see:
 *   ~/.claude/skills/production-defensive-patterns/categories/enumeration-safety/
 */

import * as request from 'supertest';
import { performance } from 'perf_hooks';
import { INestApplication, ServiceUnavailableException } from '@nestjs/common';

const ENUMERATION_TIMING_TOLERANCE_MS = 150; // CI-friendly; production aim is <50ms
const SAMPLES_PER_BRANCH = 20;

describe('<endpoint> — enumeration safety', () => {
  let app: INestApplication;
  let mockResend: { send: jest.Mock };
  let knownEmail: string;
  const unknownEmail = 'definitely-does-not-exist@example.test';

  beforeAll(async () => {
    // ... bootstrap test app ...
    knownEmail = await seedActiveUser();
  });

  afterAll(async () => { await app.close(); });

  // ─────────────────────────────────────────────────────────────────────────
  // STATUS-CODE ORACLE
  // ─────────────────────────────────────────────────────────────────────────

  describe('status-code parity', () => {
    it('returns the same status for known and unknown emails', async () => {
      const knownResp = await request(app.getHttpServer())
        .post('/auth/forgot-password').send({ email: knownEmail });
      const unknownResp = await request(app.getHttpServer())
        .post('/auth/forgot-password').send({ email: unknownEmail });

      expect(knownResp.status).toBe(unknownResp.status);
      expect(knownResp.status).toBe(204);
      expect(knownResp.body).toEqual(unknownResp.body);
      expect(knownResp.headers['content-length'])
        .toBe(unknownResp.headers['content-length']);
    });

    it('returns 204 even when the email integration throws 503', async () => {
      mockResend.send.mockRejectedValue(new ServiceUnavailableException('Resend down'));

      const knownResp = await request(app.getHttpServer())
        .post('/auth/forgot-password').send({ email: knownEmail });
      const unknownResp = await request(app.getHttpServer())
        .post('/auth/forgot-password').send({ email: unknownEmail });

      expect(knownResp.status).toBe(204);
      expect(unknownResp.status).toBe(204);
    });

    it('returns 204 even when the email integration throws 500', async () => {
      mockResend.send.mockRejectedValue(new Error('Resend internal error'));

      const knownResp = await request(app.getHttpServer())
        .post('/auth/forgot-password').send({ email: knownEmail });
      expect(knownResp.status).toBe(204);
    });

    it('returns 204 even when the user lookup throws (DB error)', async () => {
      // Force a DB error by mocking
      // ...
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TIMING ORACLE
  // ─────────────────────────────────────────────────────────────────────────

  describe('timing parity', () => {
    async function measureN(n: number, email: string): Promise<number[]> {
      const measurements: number[] = [];
      for (let i = 0; i < n; i++) {
        const start = performance.now();
        await request(app.getHttpServer())
          .post('/auth/forgot-password').send({ email });
        measurements.push(performance.now() - start);
      }
      return measurements;
    }

    function mean(xs: number[]): number {
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    }

    function stdDev(xs: number[]): number {
      const m = mean(xs);
      const variance = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / xs.length;
      return Math.sqrt(variance);
    }

    it('returns within the same wall-clock envelope for known and unknown emails', async () => {
      const knownTimes = await measureN(SAMPLES_PER_BRANCH, knownEmail);
      const unknownTimes = await measureN(SAMPLES_PER_BRANCH, unknownEmail);

      const meanDelta = Math.abs(mean(knownTimes) - mean(unknownTimes));
      // Tolerance accounts for natural CPU variance in CI
      expect(meanDelta).toBeLessThan(ENUMERATION_TIMING_TOLERANCE_MS);
    }, 30_000);

    it('the variance of each branch is similar (no bimodal distribution)', async () => {
      const knownTimes = await measureN(SAMPLES_PER_BRANCH, knownEmail);
      const unknownTimes = await measureN(SAMPLES_PER_BRANCH, unknownEmail);

      const stdRatio = Math.max(stdDev(knownTimes), stdDev(unknownTimes)) /
                       Math.min(stdDev(knownTimes), stdDev(unknownTimes));
      // Branches should have comparable spread; ratio < 3 is generous
      expect(stdRatio).toBeLessThan(3);
    }, 30_000);

    it('still parity when the integration is DOWN (both branches return in equalizer envelope)', async () => {
      mockResend.send.mockRejectedValue(new ServiceUnavailableException('down'));

      const knownTimes = await measureN(SAMPLES_PER_BRANCH, knownEmail);
      const unknownTimes = await measureN(SAMPLES_PER_BRANCH, unknownEmail);

      expect(Math.abs(mean(knownTimes) - mean(unknownTimes)))
        .toBeLessThan(ENUMERATION_TIMING_TOLERANCE_MS);
    }, 30_000);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // BEHAVIORAL EVIDENCE — actual side effects diverge ONLY where intended
  // ─────────────────────────────────────────────────────────────────────────

  describe('behavioral diff is only inside, not visible from outside', () => {
    it('known email triggers an email send; unknown does not', async () => {
      mockResend.send.mockClear();
      await request(app.getHttpServer())
        .post('/auth/forgot-password').send({ email: knownEmail });
      // Wait for fire-and-forget to settle
      await new Promise(r => setTimeout(r, 100));
      expect(mockResend.send).toHaveBeenCalledTimes(1);

      mockResend.send.mockClear();
      await request(app.getHttpServer())
        .post('/auth/forgot-password').send({ email: unknownEmail });
      await new Promise(r => setTimeout(r, 100));
      expect(mockResend.send).not.toHaveBeenCalled();
    });

    it('ambiguous (multi-tenant) email triggers no send AND fails closed', async () => {
      const sharedEmail = await seedSameEmailInTwoTenants();
      mockResend.send.mockClear();

      const resp = await request(app.getHttpServer())
        .post('/auth/forgot-password').send({ email: sharedEmail });

      expect(resp.status).toBe(204);
      await new Promise(r => setTimeout(r, 100));
      expect(mockResend.send).not.toHaveBeenCalled();
    });
  });
});

// Helper stubs
async function seedActiveUser(): Promise<string> { throw new Error('Implement'); }
async function seedSameEmailInTwoTenants(): Promise<string> { throw new Error('Implement'); }
