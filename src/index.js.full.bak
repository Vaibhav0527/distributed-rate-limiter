import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "redis";
import client from "prom-client";
import fs from "fs";
import { loadConfig, getConfig, updateConfig } from "./config/configService.js";

const app = express();
const PORT = 3000;

app.use(express.json());

// Needed for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------- Serve Dashboard --------------------
app.use(express.static(path.join(__dirname, "../public")));

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

// -------------------- Metrics Setup --------------------
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const requestCounter = new client.Counter({
  name: "api_requests_total",
  help: "Total number of API requests",
  registers: [register]
});

const blockedCounter = new client.Counter({
  name: "api_requests_blocked_total",
  help: "Total number of blocked requests",
  registers: [register]
});

const latencyHistogram = new client.Histogram({
  name: "api_request_latency_ms",
  help: "API request latency in milliseconds",
  buckets: [50, 100, 200, 300, 500, 1000],
  registers: [register]
});

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
  const startTime = Date.now();
  requestCounter.inc();

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
      blockedCounter.inc();
      latencyHistogram.observe(Date.now() - startTime);
      return res.status(429).json({
        error: "Too many requests",
        remaining: result.remaining
      });
    }

    latencyHistogram.observe(Date.now() - startTime);
    res.json({
      success: true,
      algorithm: "sliding-lua",
      remaining: result.remaining
    });
  } catch (err) {
    console.error("Request error:", err);
    latencyHistogram.observe(Date.now() - startTime);
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

// -------------------- Metrics Endpoint --------------------
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// -------------------- Server Startup --------------------
app.listen(PORT, () => {
  console.log(`Dashboard running on http://localhost:${PORT}`);
});
