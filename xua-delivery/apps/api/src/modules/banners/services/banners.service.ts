import {
  deleteCacheKey,
  getCacheJson,
  setCacheJson,
} from "../../../infra/redis/cache.js";
import { bannersRepository } from "../repository/banners.repository.js";
import { createLogger } from "../../../infra/logger/index.js";
import type { BannerType } from "@xua/shared/enums";

const log = createLogger("banners");

const CACHE_KEY = "banners:active";
const CACHE_TTL = 300; // 5 minutos

async function invalidateCache() {
  await deleteCacheKey(CACHE_KEY);
}

export const bannersService = {
  async listActive(type?: BannerType) {
    // Cache only when no type filter (full list)
    if (!type) {
      const cached = await getCacheJson<
        Awaited<ReturnType<typeof bannersRepository.findActive>>
      >(CACHE_KEY);
      if (cached) {
        log.debug("Banners served from cache");
        return cached;
      }
    }

    const banners = await bannersRepository.findActive(type);

    if (!type) {
      void setCacheJson(CACHE_KEY, banners, CACHE_TTL);
    }

    return banners;
  },

  async listAll() {
    return bannersRepository.findAll();
  },

  async create(data: Parameters<typeof bannersRepository.create>[0]) {
    const banner = await bannersRepository.create(data);
    await invalidateCache();
    return banner;
  },

  async update(id: string, data: Parameters<typeof bannersRepository.update>[1]) {
    const banner = await bannersRepository.update(id, data);
    await invalidateCache();
    return banner;
  },

  async remove(id: string) {
    await bannersRepository.remove(id);
    await invalidateCache();
  },
};
