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

interface ListActiveParams {
  search?: string;
  category?: string;
  page: number;
  limit: number;
}

export const productsService = {
  async listActive({ search, category, page, limit }: ListActiveParams) {
    const isDefaultView = !search && !category && page === 1;

    if (isDefaultView) {
      const cached = await getCacheJson<
        Awaited<ReturnType<typeof productsRepository.findActive>>
      >(CACHE_KEY);
      if (cached) {
        log.debug("Products served from cache");
        return { ...cached, page, totalPages: Math.ceil(cached.total / limit), limit };
      }
    }

    const result = await productsRepository.findActive({ search, category, page, limit });

    if (isDefaultView) {
      void setCacheJson(CACHE_KEY, result, CACHE_TTL);
    }

    return {
      ...result,
      page,
      totalPages: Math.ceil(result.total / limit),
      limit,
    };
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
    kind?: "WATER" | "BOTTLE" | "OTHER";
    bottle_product_id?: string | null;
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
      kind?: "WATER" | "BOTTLE" | "OTHER";
      bottle_product_id?: string | null;
      is_active?: boolean;
    }
  ) {
    const product = await productsRepository.update(id, data);
    void deleteCacheKey(CACHE_KEY);
    return product;
  },
};
