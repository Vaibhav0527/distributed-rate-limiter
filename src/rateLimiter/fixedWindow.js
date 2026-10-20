export async function fixedWindowLimiter({
  redis,
  key,
  limit,
  windowSeconds
}) {
  const count = await redis.incr(key);

  // First request in this window → set expiry
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }

  // Remaining time before reset
  const ttl = await redis.ttl(key);

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetInSeconds: ttl
  };
}
