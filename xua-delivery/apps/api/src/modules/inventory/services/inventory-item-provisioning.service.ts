import type { ProductKind } from "@xua/shared/enums";
import { InventoryItemType } from "@xua/shared/enums";
import { createLogger } from "../../../infra/logger/index.js";
import {
  inventoryRepository,
  type InventoryItemCatalogRow,
  type TxClient,
} from "../repository/inventory.repository.js";

const log = createLogger("inventory");

const NAME_SLUG_MAX_LENGTH = 16;
const FALLBACK_NAME_SLUG = "ITEM";
const CODE_UUID_FRAGMENT_LENGTH = 8;
const CODE_UUID_FRAGMENT_EXTENDED_LENGTH = 12;
const DEFAULT_UNIT_LABEL = "un";
const DEFAULT_LOW_STOCK_THRESHOLD = 10;

export type ProvisionableProduct = {
  id: string;
  name: string;
  kind: ProductKind;
};

export type ProvisionForProductResult = {
  item: InventoryItemCatalogRow;
  created: boolean;
};

/**
 * Código determinístico do item de estoque: slug do nome (maiúsculas, sem
 * acento, só [A-Z0-9], máx. 16 chars) + "-" + fragmento do UUID do produto.
 * Ex.: "Água 20L Premium" → "AGUA20LPREMIUM-3f9a2b1c".
 */
export function buildInventoryItemCode(
  productName: string,
  productId: string,
  uuidFragmentLength: number = CODE_UUID_FRAGMENT_LENGTH
): string {
  const slug = productName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, NAME_SLUG_MAX_LENGTH);

  const uuidFragment = productId.replace(/-/g, "").slice(0, uuidFragmentLength);

  return `${slug || FALLBACK_NAME_SLUG}-${uuidFragment}`;
}

/**
 * Escolhe um code livre ANTES do create. A pré-checagem é obrigatória: em
 * Postgres um P2002 aborta a transação inteira (25P02 em qualquer statement
 * seguinte), então reagir à colisão com retry dentro da mesma tx nunca
 * funcionaria. Se o code estendido ainda colidir (probabilidade desprezível:
 * slug igual + 12 hex iguais de UUIDs distintos), o create falha com P2002 e
 * a transação aborta — comportamento correto, sem retry.
 */
async function resolveAvailableCode(
  product: ProvisionableProduct,
  tx: TxClient
): Promise<string> {
  const code = buildInventoryItemCode(product.name, product.id);
  const taken = await inventoryRepository.findInventoryItemByCode(code, tx);
  if (!taken) return code;

  return buildInventoryItemCode(product.name, product.id, CODE_UUID_FRAGMENT_EXTENDED_LENGTH);
}

async function createItemForProduct(
  product: ProvisionableProduct,
  tx: TxClient
): Promise<InventoryItemCatalogRow> {
  const code = await resolveAvailableCode(product, tx);

  return inventoryRepository.createInventoryItem(
    {
      code,
      name: product.name,
      // SELLABLE_PRODUCT para TODOS os kinds (WATER/BOTTLE/OTHER):
      // RETURNABLE_* são singletons globais do settlement de caução sem
      // product_id — jamais criados por produto.
      type: InventoryItemType.SELLABLE_PRODUCT,
      product_id: product.id,
      unit_label: DEFAULT_UNIT_LABEL,
      low_stock_threshold: DEFAULT_LOW_STOCK_THRESHOLD,
    },
    tx
  );
}

export const inventoryItemProvisioningService = {
  /**
   * Garante a invariante "produto ativo ⇒ exatamente 1 item de estoque
   * vendável ativo vinculado". Idempotente por product_id. SEMPRE roda dentro
   * da transação recebida — nunca abre transação própria.
   *
   * Retorna null quando encontra conflito pré-existente (mais de 1 item ativo
   * para o produto) — nesse caso não altera nada para não piorar o estado.
   */
  async provisionForProduct(
    product: ProvisionableProduct,
    tx: TxClient
  ): Promise<ProvisionForProductResult | null> {
    const existingItems = await inventoryRepository.findInventoryItemsByProductId(product.id, tx);
    const activeItems = existingItems.filter((item) => item.is_active);

    if (activeItems.length === 1) {
      return { item: activeItems[0], created: false };
    }

    if (activeItems.length > 1) {
      log.warn(
        {
          product_id: product.id,
          inventory_item_ids: activeItems.map((item) => item.id),
        },
        "Product already mapped to multiple active inventory items; provisioning skipped"
      );
      return null;
    }

    // Repositório retorna ordenado por created_at desc → [0] é o mais recente.
    const mostRecentInactive = existingItems[0];
    if (mostRecentInactive) {
      const item = await inventoryRepository.reactivateInventoryItem(mostRecentInactive.id, tx);
      log.info(
        {
          product_id: product.id,
          inventory_item_id: item.id,
          code: item.code,
          origin: "product-provisioning:reactivate",
        },
        "Inventory item reactivated for product"
      );
      return { item, created: false };
    }

    const item = await createItemForProduct(product, tx);
    log.info(
      {
        product_id: product.id,
        inventory_item_id: item.id,
        code: item.code,
        origin: "product-provisioning:create",
      },
      "Inventory item created for product"
    );
    return { item, created: true };
  },
};
