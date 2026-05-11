/**
 * Race-test template — Promise.allSettled with exactly-one-fulfilled assertion.
 *
 * Copy this template per shared-state mutation. Fill in:
 *   - The service method under test
 *   - The setup that produces the contended state
 *   - The expected exception type for the loser
 *
 * The CONTRACT assertion is `expect(fulfilled).toHaveLength(1)`. Anything weaker
 * (toBeGreaterThan(0), toEqual([Error, Error]), etc.) does not prove the property.
 *
 * For background, see:
 *   ~/.claude/skills/production-defensive-patterns/categories/concurrency-cas/rules/race-test-contract.md
 */

import { Test } from '@nestjs/testing';
import { ConflictException, GoneException } from '@nestjs/common';

describe('<ServiceUnderTest>: race conditions', () => {
  let service: ServiceUnderTest;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ServiceUnderTest,
        // ... mock providers ...
      ],
    }).compile();
    service = moduleRef.get(ServiceUnderTest);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FLAVOR 1 — real concurrency against test DB / Redis (preferred)
  // ─────────────────────────────────────────────────────────────────────────

  it('two concurrent <action>s on the same shared state — exactly one succeeds', async () => {
    // Arrange: produce the contended state
    const sharedKey = await setupContendedState();

    // Act: fire both concurrently
    const [a, b] = await Promise.allSettled([
      service.<methodUnderTest>(sharedKey, /* args A */),
      service.<methodUnderTest>(sharedKey, /* args B */),
    ]);

    // Assert: EXACTLY ONE fulfilled, EXACTLY ONE rejected with the expected exception
    const fulfilled = [a, b].filter((r) => r.status === 'fulfilled');
    const rejected = [a, b].filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(GoneException);
    // (or ConflictException, depending on which CAS layer rejects the loser)

    // Verify the post-state is one of the two valid outcomes — never silently merged
    const finalState = await readSharedState(sharedKey);
    expect([/* outcome A */, /* outcome B */]).toContainEqual(finalState);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FLAVOR 2 — simulated concurrency via mock interleaving
  // ─────────────────────────────────────────────────────────────────────────

  it('stale wrong-attempt does not clobber a freshly issued state (mock interleaving)', async () => {
    // The state machine snapshots at each "tick"
    const snapshots: SharedState[] = [{ codeHash: 'H_old', attempts: 0 }];

    mockStorage.eval.mockImplementation(async (script, _numkeys, _key, expectedHash, ...rest) => {
      const current = snapshots[snapshots.length - 1];
      if (!current) return -1;
      if (current.codeHash !== expectedHash) return 0;  // ← the CAS check
      // ... apply the mutation ...
      return 1;
    });

    // T1: a fresh issuance lands while the wrong-attempt is mid-flight
    snapshots.push({ codeHash: 'H_new', attempts: 0 });

    // T2: the stale wrong-attempt arrives with H_old as expectedHash
    await expect(
      service.<methodUnderTest>({ /* stale args expecting H_old */ }),
    ).rejects.toThrow(GoneException);

    // The fresh state must be intact
    expect(snapshots[snapshots.length - 1]).toEqual({ codeHash: 'H_new', attempts: 0 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FLAVOR 3 — explicit per-call mock simulating the race-loser response
  // ─────────────────────────────────────────────────────────────────────────

  it('loser sees ConflictException when concurrent CAS wins on the user row', async () => {
    // First updateMany call (winner): count=1
    // Second updateMany call (loser):  count=0
    mockPrisma.user.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const [a, b] = await Promise.allSettled([
      service.applyChange(userId, /* A */),
      service.applyChange(userId, /* B */),
    ]);

    const fulfilled = [a, b].filter((r) => r.status === 'fulfilled');
    const conflicts = [a, b].filter(
      (r) => r.status === 'rejected' &&
             (r as PromiseRejectedResult).reason instanceof ConflictException,
    );

    expect(fulfilled).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
  });
});

// Helper stub — replace with real implementation
async function setupContendedState(): Promise<string> {
  throw new Error('Implement: produce the shared-mutable-state in its initial form');
}

async function readSharedState(key: string): Promise<unknown> {
  throw new Error('Implement: read the post-state for assertion');
}

interface SharedState {
  codeHash: string;
  attempts: number;
}

declare const ServiceUnderTest: any;
declare const mockStorage: any;
declare const mockPrisma: any;
