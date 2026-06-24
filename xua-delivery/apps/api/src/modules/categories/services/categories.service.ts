import { getCacheJson, setCacheJson } from "../../../infra/redis/cache.js";
import { categoriesRepository } from "../repository/categories.repository.js";
import { createLogger } from "../../../infra/logger";

const log = createLogger("categories");

const CACHE_KEY = "categories:all";
const CACHE_TTL = 86400; // 24 horas — dado praticamente estático

export const categoriesService = {
  async listAll() {
    const cached = await getCacheJson<
      Awaited<ReturnType<typeof categoriesRepository.findAll>>
    >(CACHE_KEY);
    if (cached) {
      log.debug("Categories served from cache");
      return cached;
    }

    const categories = await categoriesRepository.findAll();
    void setCacheJson(CACHE_KEY, categories, CACHE_TTL);
    return categories;
  },
};
