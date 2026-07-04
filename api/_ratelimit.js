// Best-effort in-memory rate limiter for Vercel serverless proxy routes.
// Limitation: state resets on cold start and is not shared across instances.
// For production distributed limiting swap to @upstash/ratelimit:
//   npm i @upstash/ratelimit @upstash/redis
//   and set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in Vercel.
const windows = new Map(); // key → [timestamp, ...]

/**
 * Returns true if the request is allowed, false if rate-limited.
 * @param {string} ip  — caller IP (from x-forwarded-for)
 * @param {string} key — discriminator, e.g. "bridge:payout"
 * @param {number} limit     — max requests per window (default 20)
 * @param {number} windowMs  — sliding window in ms (default 60 s)
 */
export function allow(ip, key, limit = 20, windowMs = 60_000) {
  const mapKey = `${ip}:${key}`;
  const now = Date.now();
  const hits = (windows.get(mapKey) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) return false;
  hits.push(now);
  windows.set(mapKey, hits);
  return true;
}

/** Extract the best available client IP from a Vercel request. */
export function clientIp(req) {
  return (
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}
