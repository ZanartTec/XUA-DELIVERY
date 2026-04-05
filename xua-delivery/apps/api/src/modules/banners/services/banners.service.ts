import redis, { ensureConnected } from "../../../infra/redis/client.js";
import { bannersRepository } from "../repository/banners.repository.js";
import { createLogger } from "../../../infra/logger/index.js";
import type { BannerType } from "@prisma/client";

const log = createLogger("banners");

const CACHE_KEY = "banners:active";
const CACHE_TTL = 300; // 5 minutos

async function invalidateCache() {
  redis.del(CACHE_KEY).catch(() => {});
}

export const bannersService = {
  async listActive(type?: BannerType) {
    await ensureConnected();
    // Cache only when no type filter (full list)
    if (!type) {
      const cached = await redis.get(CACHE_KEY).catch(() => null);
      if (cached) {
        log.debug("Banners served from cache");
        return JSON.parse(cached);
      }
    }

    const banners = await bannersRepository.findActive(type);

    if (!type) {
      redis
        .set(CACHE_KEY, JSON.stringify(banners), "EX", CACHE_TTL)
        .catch(() => {});
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
