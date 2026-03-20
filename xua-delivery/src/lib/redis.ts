import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error("FATAL: REDIS_URL não definido. Defina a variável de ambiente antes de iniciar.");
}

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
});

export default redis;
