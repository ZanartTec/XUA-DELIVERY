import redis, { ensureConnected } from "../../../infra/redis/client.js";
import { productsRepository } from "../repository/products.repository.js";
import { createLogger } from "../../../infra/logger";

const log = createLogger("products");

const CACHE_KEY = "products:active";
const CACHE_TTL = 300; // 5 minutos

export const productsService = {
  async listActive() {
    await ensureConnected();
    const cached = await redis.get(CACHE_KEY).catch(() => null);
    if (cached) {
      log.debug("Products served from cache");
      return JSON.parse(cached);
    }

    const products = await productsRepository.findActive();
    redis
      .set(CACHE_KEY, JSON.stringify(products), "EX", CACHE_TTL)
      .catch(() => {});
    return products;
  },
};
