import express from "express";
import { createClient } from "redis";
import fs from "fs";
import { loadConfig, getConfig, updateConfig } from "./config/configService.js";

const app = express();
const PORT = 3000;

app.use(express.json());

// -------------------- Redis Setup --------------------
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const redisClient = createClient({
  url: redisUrl
});

redisClient.on("error", (err) => {
  console.error("Redis Error:", err.message);
});

async function connectRedisWithRetry(retries = 10, delayMs = 1000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await redisClient.connect();
      console.log("Connected to Redis at", redisUrl);
      return;
    } catch (err) {
      console.log(
        `Redis connection attempt ${i} failed. Retrying in ${delayMs}ms...`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("Could not connect to Redis after multiple retries");
}

await connectRedisWithRetry();

// -------------------- Load Lua Script --------------------
const slidingLua = fs.readFileSync("./scripts/sliding_window.lua", "utf8");
const slidingScriptSHA = await redisClient.scriptLoad(slidingLua);
console.log("Loaded Sliding Lua SHA:", slidingScriptSHA);

// -------------------- Load Initial Config --------------------
await loadConfig(redisClient);
console.log("Initial config loaded:", getConfig());

// -------------------- Sliding Window (Lua) --------------------
async function slidingWindowLimiterLua({ key, limit, windowMs }) {
  const now = Date.now();

  const result = await redisClient.evalSha(
    slidingScriptSHA,
    {
      keys: [key],
      arguments: [now.toString(), windowMs.toString(), limit.toString()]
    }
  );

  return {
    allowed: result[0] === 1,
    remaining: Math.max(0, Number(result[1]))
  };
}

// -------------------- API Endpoint --------------------
app.get("/api/request", async (req, res) => {
  try {
    const userId = req.query.userId || "anonymous";
    const key = `rate:${userId}`;
    const config = getConfig();

    const result = await slidingWindowLimiterLua({
      key,
      limit: config.rateLimit,
      windowMs: config.windowSeconds * 1000
    });

    res.set({
      "X-RateLimit-Limit": config.rateLimit,
      "X-RateLimit-Remaining": result.remaining
    });

    if (!result.allowed) {
      return res.status(429).json({
        error: "Too many requests",
        remaining: result.remaining
      });
    }

    res.json({
      success: true,
      algorithm: "sliding-lua",
      remaining: result.remaining
    });
  } catch (err) {
    console.error("Request error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// -------------------- Admin APIs --------------------
app.get("/admin/config", (req, res) => {
  res.json(getConfig());
});

app.post("/admin/config", async (req, res) => {
  const { rateLimit, windowSeconds, algorithm } = req.body;

  if (
    typeof rateLimit !== "number" ||
    typeof windowSeconds !== "number"
  ) {
    return res.status(400).json({ error: "Invalid config payload" });
  }

  const newConfig = { rateLimit, windowSeconds, algorithm: "sliding" };
  await updateConfig(redisClient, newConfig);

  res.json({
    success: true,
    config: newConfig
  });
});

// -------------------- Server Startup --------------------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
