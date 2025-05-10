const Redis = require("ioredis");

let redisClient;

const connectRedis = () => {
  redisClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

  redisClient.on("connect", () => {
    console.log("🔌 Connected to Redis");
  });

  redisClient.on("error", (err) => {
    console.error("Redis connection error:", err);
  });
};

const getRedis = () => {
  if (!redisClient) throw new Error("Redis not initialized");
  return redisClient;
};

module.exports = {
  connectRedis,
  getRedis,
};
