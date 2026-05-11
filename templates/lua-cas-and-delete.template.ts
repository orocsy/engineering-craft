/**
 * Lua compare-and-delete template — atomic "delete IFF stored value matches what I read."
 *
 * Use case: OTP consume success path, single-use code redemption from Redis.
 *
 * For background, see:
 *   ~/.claude/skills/production-defensive-patterns/categories/concurrency-cas/rules/redis-lua-cas.md
 */

import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

const COMPARE_AND_DELETE_LUA = `
-- KEYS[1] = the key to compare and delete
-- ARGV[1] = expected codeHash (the value the caller observed at GET time)
-- Return:
--   -1 = key gone (expired/evicted between GET and EVAL)
--    0 = value mismatch (concurrent fresh write — caller should treat as expired)
--    1 = matched and deleted

local raw = redis.call('GET', KEYS[1])
if not raw then return -1 end

local ok, state = pcall(cjson.decode, raw)
if not ok then return -1 end

if state['codeHash'] ~= ARGV[1] then return 0 end

return redis.call('DEL', KEYS[1])
`;

export type CompareAndDeleteResult = 'deleted' | 'mismatch' | 'gone';

@Injectable()
export class OtpStorageService {
  constructor(private readonly redis: Redis) {}

  async compareAndDelete(
    key: string,
    expectedCodeHash: string,
  ): Promise<CompareAndDeleteResult> {
    const result = await this.redis.eval(
      COMPARE_AND_DELETE_LUA,
      1,                  // numkeys
      key,                // KEYS[1]
      expectedCodeHash,   // ARGV[1]
    );

    switch (Number(result)) {
      case 1:  return 'deleted';
      case 0:  return 'mismatch';
      case -1: return 'gone';
      default: throw new Error(`Unexpected Lua return value: ${result}`);
    }
  }
}

// Caller pattern:
//
//   const stored = await this.redis.get(otpKey);
//   if (!stored) throw new GoneException();
//   const state = JSON.parse(stored);
//
//   if (!(await bcrypt.compare(submitted, state.codeHash))) {
//     // wrong attempt path — see lua-cas-and-increment.template.ts
//     return await this.handleWrongAttempt(otpKey, state.codeHash);
//   }
//
//   const result = await this.otpStorage.compareAndDelete(otpKey, state.codeHash);
//   switch (result) {
//     case 'deleted': /* proceed with password reset */; break;
//     case 'mismatch':
//     case 'gone':    throw new GoneException('OTP expired'); // ← mask race-loss as expiry
//   }
