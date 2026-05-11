/**
 * Lua compare-and-increment template — atomic "increment counter IFF stored value matches."
 *
 * Use case: OTP wrong-attempt counter that must (a) atomically increment, (b) evict on cap,
 * (c) NOT clobber a freshly issued state.
 *
 * For background, see:
 *   ~/.claude/skills/production-defensive-patterns/categories/concurrency-cas/rules/redis-lua-cas.md
 */

import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

const COMPARE_AND_INCREMENT_LUA = `
-- KEYS[1] = the key to compare and increment
-- ARGV[1] = expected codeHash
-- ARGV[2] = max attempts (e.g. 5) — when reached, the key is DELeted (eviction)
-- ARGV[3] = TTL in seconds (>0) to refresh, or -1 to preserve current TTL via PTTL/PEXPIRE
-- Return:
--   -1 = key gone
--    0 = value mismatch (concurrent fresh write — caller should mask as expired)
--    1 = wrong attempt counted; key still ISSUED
--    2 = wrong attempt counted AND triggered cap eviction (key DELeted)

local raw = redis.call('GET', KEYS[1])
if not raw then return -1 end

local ok, state = pcall(cjson.decode, raw)
if not ok then return -1 end

if state['codeHash'] ~= ARGV[1] then return 0 end

state['attempts'] = state['attempts'] + 1

local maxAttempts = tonumber(ARGV[2])
if state['attempts'] >= maxAttempts then
  redis.call('DEL', KEYS[1])
  return 2
end

local ttl = tonumber(ARGV[3])
if ttl > 0 then
  redis.call('SET', KEYS[1], cjson.encode(state), 'EX', ttl, 'XX')
else
  -- Preserve existing TTL
  local currentTtl = redis.call('PTTL', KEYS[1])
  if currentTtl > 0 then
    redis.call('SET', KEYS[1], cjson.encode(state))
    redis.call('PEXPIRE', KEYS[1], currentTtl)
  else
    -- TTL already expired or unset — treat as gone
    redis.call('DEL', KEYS[1])
    return -1
  end
end

return 1
`;

export type CompareAndIncrementResult = 'wrong' | 'cap-hit' | 'mismatch' | 'gone';

@Injectable()
export class OtpAttemptCounter {
  private readonly MAX_ATTEMPTS = 5;

  constructor(private readonly redis: Redis) {}

  async compareAndIncrement(
    key: string,
    expectedCodeHash: string,
    refreshTtlSeconds: number = -1,
  ): Promise<CompareAndIncrementResult> {
    const result = await this.redis.eval(
      COMPARE_AND_INCREMENT_LUA,
      1,                                  // numkeys
      key,                                // KEYS[1]
      expectedCodeHash,                   // ARGV[1]
      String(this.MAX_ATTEMPTS),          // ARGV[2]
      String(refreshTtlSeconds),          // ARGV[3]
    );

    switch (Number(result)) {
      case 1:  return 'wrong';
      case 2:  return 'cap-hit';
      case 0:  return 'mismatch';
      case -1: return 'gone';
      default: throw new Error(`Unexpected Lua return value: ${result}`);
    }
  }
}

// Caller pattern (in OTP consume path, the bcrypt-compare-failed branch):
//
//   const result = await this.attemptCounter.compareAndIncrement(otpKey, observedCodeHash);
//   switch (result) {
//     case 'wrong':    throw new UnauthorizedException('Wrong code'); break;
//     case 'cap-hit':  throw new ForbiddenException('Too many attempts'); break;
//     case 'mismatch': throw new GoneException('OTP expired'); break;  // mask race-loss
//     case 'gone':     throw new GoneException('OTP expired'); break;
//   }
