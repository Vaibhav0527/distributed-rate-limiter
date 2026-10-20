const CONFIG_KEY = "config:ratelimiter";

let cachedConfig = null;

export async function loadConfig(redis) {
  const raw = await redis.get(CONFIG_KEY);

  if (!raw) {
    cachedConfig = {
      rateLimit: 5,
      windowSeconds: 10,
      algorithm: "sliding"
    };
    await redis.set(CONFIG_KEY, JSON.stringify(cachedConfig));
  } else {
    cachedConfig = JSON.parse(raw);
  }

  return cachedConfig;
}

export function getConfig() {
  return cachedConfig;
}

export async function updateConfig(redis, newConfig) {
  cachedConfig = newConfig;
  await redis.set(CONFIG_KEY, JSON.stringify(newConfig));
}
