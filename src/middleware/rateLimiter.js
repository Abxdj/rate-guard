const { tokenBucket } = require("../algorithms/tokenBucket");
const { slidingWindow } = require("../algorithms/slidingWindow");
const { leakyBucket } = require("../algorithms/leakyBucket");

const ALGORITHMS = {
  token_bucket: tokenBucket,
  sliding_window: slidingWindow,
  leaky_bucket: leakyBucket,
};

/**
 * Extracts a unique identifier for rate limiting.
 * Priority: API key header > IP address
 */
function getIdentifier(req) {
  return (
    req.headers["x-api-key"] ||
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

/**
 * Core rate limiter middleware.
 * Reads ALGORITHM from .env, falls back to token_bucket.
 * Attaches result headers so clients know their limit status.
 */
function rateLimiter(options = {}) {
  const algorithmName =
    options.algorithm || process.env.ALGORITHM || "token_bucket";
  const algorithm = ALGORITHMS[algorithmName];

  if (!algorithm) {
    throw new Error(
      `Unknown algorithm: "${algorithmName}". Valid options: ${Object.keys(ALGORITHMS).join(", ")}`
    );
  }

  return async (req, res, next) => {
    const identifier = getIdentifier(req);

    try {
      const result = await algorithm(identifier);

      // Standard rate limit headers (RateLimit spec draft)
      res.setHeader("X-RateLimit-Limit", result.limit);
      res.setHeader("X-RateLimit-Remaining", result.remaining);
      res.setHeader("X-RateLimit-Algorithm", result.algorithm);

      if (!result.allowed) {
        res.setHeader("Retry-After", result.retryAfter);
        return res.status(429).json({
          error: "Too Many Requests",
          message: `Rate limit exceeded. Try again in ${result.retryAfter}s.`,
          retryAfter: result.retryAfter,
          algorithm: result.algorithm,
        });
      }

      next();
    } catch (err) {
      // If Redis is down, fail open (allow the request) and log the error.
      // In production you might want to fail closed — your call.
      console.error("[RateLimiter] Error checking limit:", err.message);
      next();
    }
  };
}

module.exports = { rateLimiter };
