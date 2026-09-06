import Redis from "ioredis";
import "dotenv/config";

const redisUrl = process.env.REDIS_URL;

export const redis = redisUrl ? new Redis(redisUrl) : null;

if (redis) {
  redis.on("connect", () => console.log("Redis Connected Successfully"));
  redis.on("error", (err) => console.error("Redis Connection Error", err));
} else {
  console.warn("No REDIS_URL provided, Redis caching is disabled.");
}
