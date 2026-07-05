// Distributed rate limiter for Vercel serverless proxy routes.
//
// When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set in Vercel env,
// uses @upstash/ratelimit (sliding-window, shared across all function instances).
// Falls back to an in-memory Map for local development (resets on cold start).
//
// Set up Upstash:
//   1. Create a free Redis database at upstash.com
//   2. Copy REST URL + token to Vercel env vars:
//      UPSTASH_REDIS_REST_URL=https://...upstash.io
//      UPSTASH_REDIS_REST_TOKEN=AX...
//   3. Add the same vars to .env for local testing (gitignored).

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ── Upstash path ─────────────────────────────────────────────────────────────

let _redis = null;
const _limiters = new Map(); // "limit:windowSec" → Ratelimit

function getUpstashLimiter(limit, windowMs) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const mapKey = `${limit}:${windowMs}`;
  if (!_limiters.has(mapKey)) {
    if (!_redis) _redis = new Redis({ url, token });
    _limiters.set(
      mapKey,
      new Ratelimit({
        redis: _redis,
        limiter: Ratelimit.slidingWindow(limit, `${Math.ceil(windowMs / 1000)} s`),
        analytics: false,
      }),
    );
  }
  return _limiters.get(mapKey);
}

// ── In-memory fallback (local dev / cold-start single instance) ───────────────

const _windows = new Map(); // "ip:key" → [timestamp, ...]

function allowInMemory(ip, key, limit, windowMs) {
  const mapKey = `${ip}:${key}`;
  const now = Date.now();
  const hits = (_windows.get(mapKey) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) return false;
  hits.push(now);
  _windows.set(mapKey, hits);
  return true;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns true if the request is allowed, false if rate-limited.
 * Always async — awaits Upstash when configured, resolves immediately otherwise.
 *
 * @param {string} ip       — caller IP from clientIp()
 * @param {string} key      — discriminator, e.g. "bridge:payout"
 * @param {number} limit    — max requests per window (default 20)
 * @param {number} windowMs — sliding window in ms (default 60 s)
 */
export async function allow(ip, key, limit = 20, windowMs = 60_000) {
  const limiter = getUpstashLimiter(limit, windowMs);
  if (limiter) {
    const { success } = await limiter.limit(`${key}:${ip}`);
    return success;
  }
  return allowInMemory(ip, key, limit, windowMs);
}

/** Extract the best available client IP from a Vercel request. */
export function clientIp(req) {
  return (
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}
