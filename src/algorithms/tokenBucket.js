const { getRedisClient } = require("../redis");

/**
 * Token Bucket Algorithm
 *
 * Each key (IP or API key) gets a "bucket" with a max capacity of tokens.
 * Tokens refill at a fixed rate over time. Each request consumes one token.
 * If the bucket is empty → 429.
 *
 * Why Lua? The check-and-update must be atomic. Without it, two concurrent
 * requests can both read "1 token left", both pass, and both decrement — 
 * allowing two requests when only one should go through.
 */
const TOKEN_BUCKET_SCRIPT = `
local key       = KEYS[1]
local capacity  = tonumber(ARGV[1])
local refill    = tonumber(ARGV[2])  -- tokens per second
local now       = tonumber(ARGV[3])  -- current time in ms

local data      = redis.call("HMGET", key, "tokens", "last_refill")
local tokens    = tonumber(data[1]) or capacity
local last_refill = tonumber(data[2]) or now

-- Calculate how many tokens to add since last request
local elapsed   = math.max(0, now - last_refill) / 1000  -- convert ms → seconds
local new_tokens = math.min(capacity, tokens + elapsed * refill)

if new_tokens < 1 then
  -- Bucket empty — compute when the next token will be available
  local retry_after = math.ceil((1 - new_tokens) / refill)
  return { 0, math.floor(new_tokens * 1000) / 1000, retry_after }
end

new_tokens = new_tokens - 1
redis.call("HMSET", key, "tokens", new_tokens, "last_refill", now)
redis.call("PEXPIRE", key, math.ceil(capacity / refill * 1000))

return { 1, math.floor(new_tokens * 1000) / 1000, 0 }
`;

async function tokenBucket(identifier) {
  const redis = getRedisClient();
  const capacity = parseInt(process.env.TOKEN_BUCKET_CAPACITY || "10");
  const refillRate = parseFloat(process.env.TOKEN_BUCKET_REFILL_RATE || "5");
  const now = Date.now();

  const key = `rate:tb:${identifier}`;

  const [allowed, remaining, retryAfter] = await redis.eval(
    TOKEN_BUCKET_SCRIPT,
    1,
    key,
    capacity,
    refillRate,
    now
  );

  return {
    allowed: allowed === 1,
    remaining: Math.floor(remaining),
    retryAfter: retryAfter || 0,
    algorithm: "token_bucket",
    limit: capacity,
  };
}

module.exports = { tokenBucket };
