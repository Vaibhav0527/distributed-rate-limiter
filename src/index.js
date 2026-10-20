import express from "express";
import { createClient } from "redis";

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

// -------------------- Server Startup --------------------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
