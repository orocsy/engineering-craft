---
title: Redis Compare-And-Modify on Stored Value Requires Lua
last-referenced: 2026-05-12
maturity: proven
type: pitfall
impact: CRITICAL
impact-description: |
  `SET XX` only protects key existence, not value match. If you need to mutate IFF the
  stored value matches what you read, you MUST use a Lua script — Redis is single-threaded
  so the entire script is atomic.
tags: concurrency, cas, redis, lua, otp, token
applies-to: |
  Mutating a Redis value conditionally on what you read. Especially OTP wrong-attempt
  counters, single-use codes, optimistic refresh of cached state.
related-rules:
  - state-machine-first
  - storage-gate-not-js
  - single-use-token-consumption
historical-incidents:
  - a real incident: OTP wrong-attempt SET XX overwrote freshly-issued state
  - a real incident: OTP consume DEL deleted a freshly-issued key
  - a real incident: audit-found wrong-attempt counter swallow
---

## Why this matters

Redis `SET key value EX ttl XX` only fires if the **key exists**. It does NOT compare
the existing value to anything. So if a concurrent writer has already overwritten
your value but the key still exists, your `SET XX` succeeds and silently clobbers the
concurrent writer's update.

This was the root cause of two consecutive review rounds — and was repeated in 5+ subtle
variants across the OTP code path.

The only correct primitive for "mutate IFF current value matches X" is a Lua script.
Lua scripts in Redis are atomic by construction: Redis is single-threaded, so the entire
script runs without interruption.

## Incorrect — the pattern that bit a real wrong-attempt race

```typescript
// ❌ User submits a wrong code. Bump attempts in Redis.
// Concurrent: a SECOND wrong submission arrives — or user requests a fresh OTP mid-flight.

const raw = await client.get(key);
if (!raw) return { ok: false, reason: 'expired' };
const state = JSON.parse(raw);

if (await bcrypt.compare(submitted, state.codeHash)) {
  await client.del(key); // (this also has a race — see redis-lua-cas-and-delete)
  return { ok: true };
}

const newState = { ...state, attempts: state.attempts + 1 };
const ttl = await client.ttl(key);
await client.set(key, JSON.stringify(newState), 'EX', ttl, 'XX'); // ← BROKEN
return { ok: false, reason: 'wrong' };
```

Race scenarios:

**Race A (two concurrent wrong submissions):**
- Both `get` returns `{attempts: 0, codeHash: H}`
- Both compute `newState = {attempts: 1}`
- Both `SET XX` succeed (key still exists)
- Counter is `1`, not `2`. Brute-force budget silently doubled.

**Race B (wrong submission overlaps with `requestOtp`):**
- T0: wrong submission `get` returns `{attempts: 0, codeHash: H_old}`
- T1: `requestOtp` arrives, `SET key {attempts:0, codeHash: H_new}` (no XX)
- T2: wrong submission `SET XX` writes `{attempts:1, codeHash: H_old}` (because it
  read the old codeHash before the requestOtp overwrote)
- T3: User submits the FRESH code `H_new` — bcrypt compare against `H_old` fails. User
  CANNOT consume the fresh code. Worse: user could submit the OLD code now and the
  comparison would succeed against `H_old`. The fresh OTP is silently neutered.

## Correct — Lua compare-and-increment

```lua
-- KEYS[1] = pwreset:otp:<tenantId>:<userId>
-- ARGV[1] = expected codeHash (the one the caller read)
-- ARGV[2] = max attempts (e.g. 5)
-- ARGV[3] = remaining TTL seconds (caller computes via TTL command before call, OR
--           pass -1 to mean "preserve existing TTL")
-- Return:
--   -1 = key gone (expired or evicted) — caller throws "expired"
--    0 = codeHash mismatch (concurrent fresh issuance) — caller throws "expired"
--    1 = wrong attempt counted — caller returns "wrong"
--    2 = wrong attempt that hit cap, key evicted — caller throws "too many attempts"

local raw = redis.call('GET', KEYS[1])
if not raw then return -1 end

local ok, state = pcall(cjson.decode, raw)
if not ok then return -1 end

if state['codeHash'] ~= ARGV[1] then
  return 0  -- value mismatch: a fresh requestOtp landed between caller's GET and now
end

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
  -- preserve existing TTL: read current TTL first, then SET with PEXPIRE
  local currentTtl = redis.call('PTTL', KEYS[1])
  if currentTtl > 0 then
    redis.call('SET', KEYS[1], cjson.encode(state))
    redis.call('PEXPIRE', KEYS[1], currentTtl)
  else
    redis.call('DEL', KEYS[1])  -- key already expiring; delete to be safe
  end
end
return 1
```

```typescript
// TypeScript caller
const result = await this.redis.eval(
  OTP_COMPARE_AND_INCREMENT_LUA,
  1,                                          // numkeys
  this.otpKey(tenantId, userId),              // KEYS[1]
  expectedCodeHash,                           // ARGV[1]
  String(this.MAX_ATTEMPTS),                  // ARGV[2]
  String(remainingTtl),                       // ARGV[3]
);

switch (Number(result)) {
  case -1: throw new GoneException('OTP expired');
  case 0:  throw new GoneException('OTP expired');           // mask race-loss as expiry
  case 1:  throw new UnauthorizedException('Wrong code');    // counted, room to retry
  case 2:  throw new ForbiddenException('Too many attempts'); // cap hit, evicted
  default: throw new InternalServerErrorException();
}
```

## The other Lua: compare-and-delete (consume path)

For the success path of OTP consume, you need a separate (smaller) Lua script that
deletes the key IFF the codeHash matches:

```lua
-- KEYS[1] = otp key
-- ARGV[1] = expected codeHash
-- Return:
--   -1 = key gone
--    0 = value mismatch (concurrent fresh issuance — fresh key NOT deleted)
--    1 = matched + deleted

local raw = redis.call('GET', KEYS[1])
if not raw then return -1 end
local ok, state = pcall(cjson.decode, raw)
if not ok then return -1 end
if state['codeHash'] ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
```

This prevents the stale-consume race: a stale consume cannot delete a freshly issued key.

## Why `pcall(cjson.decode, raw)` and not `cjson.decode(raw)`

Lua's default behavior on cjson decode failure is to throw and abort the script. If the
stored value is corrupted (manual tampering, data migration mid-flight), you'd return
an unhelpful Redis error to the client. Wrapping in `pcall` lets you handle it as a
"key gone" condition (return -1) and surface a clean 410.

## Why pass TTL as ARGV instead of reading it inside Lua

Redis Lua's `PTTL`/`TTL` works inside scripts, but mixing TTL math with conditional
SET/PEXPIRE inside Lua is hard to test and easy to get wrong. Compute TTL in JS, pass
as ARGV, let Lua use it directly. The TTL might drift by a few ms vs. true remaining
time — that's acceptable.

## Tests that prove it

```typescript
describe('OTP wrong-attempt: race against fresh issuance', () => {
  it('does NOT clobber a freshly issued state when a stale wrong-attempt arrives', async () => {
    // T0: issue OTP "AAA" (codeHash=H_old)
    await service.requestPasswordResetOtp({ email });
    const stateA = JSON.parse(await redis.get(otpKey));
    expect(stateA.attempts).toBe(0);

    // T1: simulate a wrong-attempt that READ H_old but hasn't SET yet
    // (in real life: the wrong-attempt flow is mid-await on bcrypt.compare)

    // T2: a fresh OTP "BBB" (codeHash=H_new) is issued, overwriting Redis
    await service.requestPasswordResetOtp({ email });
    const stateB = JSON.parse(await redis.get(otpKey));
    expect(stateB.attempts).toBe(0);
    expect(stateB.codeHash).not.toBe(stateA.codeHash);

    // T3: the wrong-attempt finally writes with the OLD codeHash predicate.
    // Lua sees mismatch (stored is H_new, expected is H_old) → return 0 → no write.
    await expect(
      service.resetPasswordOtp({ email, code: 'AAA', newPassword: '...' }),
    ).rejects.toThrow(GoneException);

    // Verify the FRESH state is intact — codeHash unchanged, attempts=0.
    const stateAfter = JSON.parse(await redis.get(otpKey));
    expect(stateAfter.codeHash).toBe(stateB.codeHash);
    expect(stateAfter.attempts).toBe(0);
  });
});
```

## Anti-patterns

- "I'll add SET XX, that's the canonical Redis CAS" → No. XX gates on existence, not
  value. The CAS we need is on the value.
- "I'll add a Redis Redlock around the whole flow" → Heavy. Lua is the right primitive
  for single-key CAS. Reserve Redlock for cross-key invariants.
- "I'll just retry on mismatch" → Sometimes correct (optimistic retry), but for
  password-reset OTP the mismatch usually means a concurrent issuance and you should
  surface "expired" to make the user request fresh.
- "I'll use WATCH/MULTI/EXEC" — works, but Lua is more compact, easier to test, and
  doesn't require a round trip per WATCH.

## References

- Redis EVAL semantics: https://redis.io/docs/latest/develop/interact/programmability/eval-intro/
- Redis Lua atomicity: scripts run with the same atomicity as MULTI/EXEC blocks.
- ioredis `eval` API: https://github.com/redis/ioredis#lua-scripting

## Templates

- [lua-cas-and-delete.template.ts](../../../templates/lua-cas-and-delete.template.ts)
- [lua-cas-and-increment.template.ts](../../../templates/lua-cas-and-increment.template.ts)
