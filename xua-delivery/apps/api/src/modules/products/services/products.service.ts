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

  async listAll() {
    return productsRepository.findAll();
  },

  async create(data: {
    name: string;
    description?: string | null;
    image_url?: string | null;
    price_cents: number;
    deposit_cents?: number;
  }) {
    const product = await productsRepository.create(data);
    redis.del(CACHE_KEY).catch(() => {});
    return product;
  },

  async update(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      image_url?: string | null;
      price_cents?: number;
      deposit_cents?: number;
      is_active?: boolean;
    }
  ) {
    const product = await productsRepository.update(id, data);
    // Invalida cache do catálogo ativo
    redis.del(CACHE_KEY).catch(() => {});
    return product;
  },
};
