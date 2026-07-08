import {
  deleteCacheKey,
  getCacheJson,
  setCacheJson,
} from "../../../infra/redis/cache.js";
import { getPrisma } from "../../../infra/prisma/client.js";
import { inventoryItemProvisioningService } from "../../inventory/services/inventory-item-provisioning.service.js";
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
    kind?: "WATER" | "BOTTLE" | "OTHER";
    bottle_product_id?: string | null;
  }) {
    // Produto e item de estoque vendável nascem na mesma transação: sem o
    // item, o aceite do pedido falha com INVENTORY_ITEM_NOT_FOUND.
    const product = await getPrisma().$transaction(async (tx) => {
      const created = await productsRepository.create(data, tx);
      await inventoryItemProvisioningService.provisionForProduct(created, tx);
      return created;
    });
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
      kind?: "WATER" | "BOTTLE" | "OTHER";
      bottle_product_id?: string | null;
      is_active?: boolean;
    }
  ) {
    const product = await getPrisma().$transaction(async (tx) => {
      const updated = await productsRepository.update(id, data, tx);
      // Invariante: produto ativo ⇒ item vendável ativo. Cobre produto legado
      // (criado antes do provisionamento) e produto reativado com item inativo.
      if (updated.is_active) {
        await inventoryItemProvisioningService.provisionForProduct(updated, tx);
      }
      return updated;
    });
    void deleteCacheKey(CACHE_KEY);
    return product;
  },
};
