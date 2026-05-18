import {
  deleteCacheKey,
  getCacheJson,
  setCacheJson,
} from "../../../infra/redis/cache.js";
import { productsRepository } from "../repository/products.repository.js";
import { createLogger } from "../../../infra/logger";

const log = createLogger("products");

const CACHE_KEY = "products:active";
const CACHE_TTL = 300; // 5 minutos

export const productsService = {
  async listActive() {
    const cached = await getCacheJson<
      Awaited<ReturnType<typeof productsRepository.findActive>>
    >(CACHE_KEY);
    if (cached) {
      log.debug("Products served from cache");
      return cached;
    }

    const products = await productsRepository.findActive();
    void setCacheJson(CACHE_KEY, products, CACHE_TTL);
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
    void deleteCacheKey(CACHE_KEY);
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
    void deleteCacheKey(CACHE_KEY);
    return product;
  },
};
