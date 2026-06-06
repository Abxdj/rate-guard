const { getRedisClient } = require("../redis");

/**
 * Leaky Bucket Algorithm
 *
 * Requests fill a bucket. The bucket drains at a fixed rate.
 * If the bucket is full when a request arrives → 429.
 *
 * Unlike token bucket, this enforces a SMOOTH output rate.
 * Token bucket allows bursts up to capacity. Leaky bucket doesn't —
 * requests are only allowed at the drain rate, no matter what.
 *
 * Redis stores: current queue size + timestamp of last drain.
 */
const LEAKY_BUCKET_SCRIPT = `
local key        = KEYS[1]
local capacity   = tonumber(ARGV[1])
local drain_rate = tonumber(ARGV[2])  -- requests per second
local now        = tonumber(ARGV[3])  -- ms

local data       = redis.call("HMGET", key, "queue", "last_drain")
local queue      = tonumber(data[1]) or 0
local last_drain = tonumber(data[2]) or now

-- Drain the bucket based on elapsed time
local elapsed    = math.max(0, now - last_drain) / 1000
local drained    = math.floor(elapsed * drain_rate)
local new_queue  = math.max(0, queue - drained)

if new_queue >= capacity then
  -- Bucket full — calculate when next slot opens
  local retry_after = math.ceil((new_queue - capacity + 1) / drain_rate)
  return { 0, new_queue, retry_after }
end

-- Add request to queue
new_queue = new_queue + 1
redis.call("HMSET", key, "queue", new_queue, "last_drain", now)
redis.call("PEXPIRE", key, math.ceil(capacity / drain_rate * 1000))

return { 1, new_queue, 0 }
`;

async function leakyBucket(identifier) {
  const redis = getRedisClient();
  const capacity = parseInt(process.env.LEAKY_BUCKET_CAPACITY || "10");
  const drainRate = parseFloat(process.env.LEAKY_BUCKET_DRAIN_RATE || "2");
  const now = Date.now();

  const key = `rate:lb:${identifier}`;

  const [allowed, queue, retryAfter] = await redis.eval(
    LEAKY_BUCKET_SCRIPT,
    1,
    key,
    capacity,
    drainRate,
    now
  );

  return {
    allowed: allowed === 1,
    remaining: Math.max(0, capacity - queue),
    retryAfter: retryAfter || 0,
    algorithm: "leaky_bucket",
    limit: capacity,
  };
}

module.exports = { leakyBucket };