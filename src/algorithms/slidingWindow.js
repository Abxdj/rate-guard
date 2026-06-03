const { getRedisClient } = require("../redis");

/**
 * Sliding Window Counter Algorithm
 *
 * Tracks request timestamps in a sorted set (ZSET). On each request:
 * 1. Remove all entries older than the window size
 * 2. Count remaining entries
 * 3. If count < limit → allow and add this timestamp
 * 4. Else → 429
 *
 * More accurate than fixed-window counters — no "double the limit at window edges" bug.
 * Trade-off: stores one entry per request (more memory than token bucket).
 */
async function slidingWindow(identifier) {
  const redis = getRedisClient();
  const limit = parseInt(process.env.SLIDING_WINDOW_LIMIT || "20");
  const windowMs = parseInt(process.env.SLIDING_WINDOW_SIZE_MS || "60000");
  const now = Date.now();
  const windowStart = now - windowMs;

  const key = `rate:sw:${identifier}`;

  const pipeline = redis.pipeline();

  // Remove timestamps outside the window
  pipeline.zremrangebyscore(key, 0, windowStart);
  // Count requests in current window
  pipeline.zcard(key);
  // Set expiry so keys clean themselves up
  pipeline.pexpire(key, windowMs);

  const results = await pipeline.exec();
  const currentCount = results[1][1];

  if (currentCount >= limit) {
    // Find the oldest entry to calculate retry-after
    const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
    const oldestTimestamp = oldest.length ? parseFloat(oldest[1]) : now;
    const retryAfter = Math.ceil((oldestTimestamp + windowMs - now) / 1000);

    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, retryAfter),
      algorithm: "sliding_window",
      limit,
    };
  }

  // Add current request timestamp as a unique member
  await redis.zadd(key, now, `${now}-${Math.random()}`);

  return {
    allowed: true,
    remaining: limit - currentCount - 1,
    retryAfter: 0,
    algorithm: "sliding_window",
    limit,
  };
}

module.exports = { slidingWindow };
