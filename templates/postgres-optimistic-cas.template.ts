/**
 * Postgres optimistic CAS template — `tokenVersion` (or any version counter) predicate
 * on `updateMany`.
 *
 * Use case: any user-row write that can be triggered from >1 endpoint or >1 credential
 * type (link reset + OTP reset both → applyPasswordReset).
 *
 * For background, see:
 *   ~/.claude/skills/production-defensive-patterns/categories/concurrency-cas/rules/postgres-optimistic-cas.md
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Apply a password reset using optimistic concurrency control.
 *
 * The `tokenVersion` field acts as a CAS predicate: we read the current value at
 * the start of the transaction, then `updateMany` with `tokenVersion = captured`.
 * Postgres re-evaluates the WHERE predicate against the latest committed row at
 * lock acquisition. If a concurrent transaction already incremented `tokenVersion`,
 * our updateMany returns `count: 0` and we throw ConflictException.
 *
 * Works under READ COMMITTED isolation. No need for SERIALIZABLE.
 */
export async function applyPasswordResetWithCas(
  tx: Prisma.TransactionClient,
  userId: string,
  newPasswordHash: string,
): Promise<void> {
  // 1. Capture the current tokenVersion
  const userBefore = await tx.user.findUnique({
    where: { id: userId },
    select: { tokenVersion: true },
  });
  if (!userBefore) {
    throw new NotFoundException('User not found');
  }

  // 2. CAS write: predicate on (id, tokenVersion = captured)
  const result = await tx.user.updateMany({
    where: {
      id: userId,
      tokenVersion: userBefore.tokenVersion,
    },
    data: {
      passwordHash: newPasswordHash,
      tokenVersion: { increment: 1 },
    },
  });

  if (result.count !== 1) {
    throw new ConflictException(
      'Concurrent password reset detected — please request a fresh credential and retry',
    );
  }

  // 3. Revoke ALL outstanding reset tokens for this user (sibling-resource invariant)
  await tx.passwordResetToken.updateMany({
    where: {
      userId,
      consumedAt: null,
    },
    data: {
      consumedAt: new Date(),
    },
  });
}

/**
 * Wrapper that runs the CAS apply inside a Prisma transaction.
 */
export async function applyPasswordReset(
  prisma: Prisma.TransactionClient | { $transaction: typeof Prisma.TransactionClient.prototype.$transaction } & any,
  userId: string,
  newPasswordHash: string,
): Promise<void> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await applyPasswordResetWithCas(tx, userId, newPasswordHash);
  });
}

/**
 * Single-use token consumption with CAS via WHERE predicate.
 *
 * Use case: reset link, magic link, invite acceptance — anything with a
 * `consumedAt: null` flag.
 */
export async function consumeSingleUseToken(
  tx: Prisma.TransactionClient,
  jti: string,
): Promise<{ userId: string }> {
  const result = await tx.passwordResetToken.updateMany({
    where: {
      jti,
      consumedAt: null,                    // CAS gate
      expiresAt: { gt: new Date() },       // also part of the gate
    },
    data: {
      consumedAt: new Date(),
    },
  });

  if (result.count !== 1) {
    throw new ConflictException('Token already consumed or expired');
  }

  // Now safe to read other columns — we hold the row in this tx
  const record = await tx.passwordResetToken.findUnique({
    where: { jti },
    select: { userId: true },
  });

  if (!record) {
    throw new NotFoundException('Token not found after consume');
  }

  return { userId: record.userId };
}
