import {
  ActorType,
  AuditEventType,
  DepositMovementType,
  InventoryMovementType,
  InventoryReferenceType,
  ProductKind,
  SourceApp,
} from "@xua/shared/enums";
import { auditRepository } from "../../audit/audit.repository.js";
import { inventoryService } from "../../inventory/services/inventory.service.js";
import { inventoryRepository } from "../../inventory/repository/inventory.repository.js";
import { getPrisma } from "../../../infra/prisma/client.js";
import { createLogger } from "../../../infra/logger";
import { depositRepository, type TxClient } from "../repository/deposit.repository.js";

const log = createLogger("deposit-settlement");

export type ProgramEligibility = {
  isEnabled: boolean;
  maxBottles: number;
} | null;

export type SettlementResult = {
  missing: number;
  sold: number;
  loaned: number;
};

/**
 * Motor de settlement de vasilhames (lógica pura, por tipo de vasilhame).
 *
 * DEFAULT = VENDA. Caução é EXCEÇÃO concedida pela distribuidora: só com vínculo
 * ativo (programa habilitado) e dentro do limite (max_bottles) do consumidor.
 *
 * REGRA DE NEGÓCIO (mutável): faltantes acima do limite são VENDIDOS automaticamente.
 * Ver docs/Doc_sistema/arquitetura_caucao_vasilhames.md §"Excedente de limite".
 */
export function computeSettlement(input: {
  bottlesFullOrdered: number;
  emptyBottlesProvided: number;
  program: ProgramEligibility;
  currentBalance: number;
}): SettlementResult {
  const missing = Math.max(0, input.bottlesFullOrdered - input.emptyBottlesProvided);
  let sold = missing;
  let loaned = 0;

  const eligible =
    input.program != null && input.program.isEnabled && input.program.maxBottles > 0;

  if (eligible) {
    const headroom = Math.max(0, input.program!.maxBottles - input.currentBalance);
    loaned = Math.min(missing, headroom);
    sold = missing - loaned;
  }

  return { missing, sold, loaned };
}

/**
 * Grupo de vasilhame de um pedido: o vasilhame-produto vinculado às águas, o item
 * de estoque correspondente, preço e quantidade demandada.
 */
export type BottleGroup = {
  bottleProductId: string;
  bottleProductName: string;
  bottleInventoryItemId: string | null;
  bottleUnitPriceCents: number;
  bottlesOrdered: number;
};

/**
 * Resolve os grupos de vasilhame de um pedido a partir do vínculo água→vasilhame
 * (Product.kind=WATER → bottle_product_id). 1 unidade de água demanda 1 vasilhame.
 */
export async function resolveBottleGroups(
  items: Array<{ product_id: string; quantity: number }>,
  tx?: TxClient
): Promise<BottleGroup[]> {
  const prisma = getPrisma();
  const client = tx ?? prisma;
  const productIds = items.map((i) => i.product_id);

  const products = await client.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, kind: true, bottle_product_id: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  // bottlesOrdered por vasilhame-produto
  const orderedByBottle = new Map<string, number>();
  for (const item of items) {
    const product = byId.get(item.product_id);
    if (!product || product.kind !== ProductKind.WATER || !product.bottle_product_id) continue;
    orderedByBottle.set(
      product.bottle_product_id,
      (orderedByBottle.get(product.bottle_product_id) ?? 0) + item.quantity
    );
  }
  if (orderedByBottle.size === 0) return [];

  const bottleIds = [...orderedByBottle.keys()];
  const [bottleProducts, bottleInventoryItems] = await Promise.all([
    client.product.findMany({
      where: { id: { in: bottleIds } },
      select: { id: true, name: true, price_cents: true },
    }),
    inventoryRepository.findActiveInventoryItemsByProductIds(bottleIds, tx),
  ]);
  const bottleProductById = new Map(bottleProducts.map((b) => [b.id, b]));
  const invByProduct = new Map<string, string>();
  for (const inv of bottleInventoryItems) {
    if (inv.product_id) invByProduct.set(inv.product_id, inv.id);
  }

  return bottleIds.map((bottleId) => {
    const bp = bottleProductById.get(bottleId);
    return {
      bottleProductId: bottleId,
      bottleProductName: bp?.name ?? "Vasilhame",
      bottleInventoryItemId: invByProduct.get(bottleId) ?? null,
      bottleUnitPriceCents: bp?.price_cents ?? 0,
      bottlesOrdered: orderedByBottle.get(bottleId) ?? 0,
    };
  });
}

export type BottleSettlement = BottleGroup & SettlementResult & { emptiesProvided: number };

/**
 * Settlement por grupo, compartilhando o teto (max_bottles) do consumidor entre
 * os vasilhames (headroom corre globalmente).
 */
export async function settlePerBottle(
  params: {
    distributorId: string;
    consumerId: string;
    groups: BottleGroup[];
    emptiesByBottle: Map<string, number>;
  },
  tx?: TxClient
): Promise<BottleSettlement[]> {
  const program = await depositRepository.findProgram(
    params.distributorId,
    params.consumerId,
    tx
  );
  const eligibility: ProgramEligibility = program
    ? { isEnabled: program.is_enabled, maxBottles: program.max_bottles }
    : null;

  // Saldo total atual do consumidor (o teto é por consumidor, não por item).
  let runningBalance = await depositRepository.sumBalancesForConsumer(
    params.distributorId,
    params.consumerId,
    tx
  );

  const results: BottleSettlement[] = [];
  for (const group of params.groups) {
    const emptiesProvided = params.emptiesByBottle.get(group.bottleProductId) ?? 0;
    const r = computeSettlement({
      bottlesFullOrdered: group.bottlesOrdered,
      emptyBottlesProvided: emptiesProvided,
      program: eligibility,
      currentBalance: runningBalance,
    });
    runningBalance += r.loaned;
    results.push({ ...group, ...r, emptiesProvided });
  }
  return results;
}

export const depositSettlementService = {
  computeSettlement,
  resolveBottleGroups,
  settlePerBottle,

  /**
   * Preview do settlement para o checkout (backend decide venda x caução).
   */
  async previewForCheckout(params: {
    distributorId: string;
    consumerId: string;
    items: Array<{ product_id: string; quantity: number }>;
    emptiesByBottle: Map<string, number>;
  }) {
    const groups = await resolveBottleGroups(params.items);
    const settled = await settlePerBottle({
      distributorId: params.distributorId,
      consumerId: params.consumerId,
      groups,
      emptiesByBottle: params.emptiesByBottle,
    });

    const totals = settled.reduce(
      (acc, s) => {
        acc.bottles_full_ordered += s.bottlesOrdered;
        acc.empty_bottles_provided += s.emptiesProvided;
        acc.bottles_sold += s.sold;
        acc.bottles_loaned += s.loaned;
        acc.sold_amount_cents += s.sold * s.bottleUnitPriceCents;
        return acc;
      },
      {
        bottles_full_ordered: 0,
        empty_bottles_provided: 0,
        bottles_sold: 0,
        bottles_loaned: 0,
        sold_amount_cents: 0,
      }
    );

    return {
      ...totals,
      bottles: settled.map((s) => ({
        bottle_product_id: s.bottleProductId,
        bottle_name: s.bottleProductName,
        unit_price_cents: s.bottleUnitPriceCents,
        ordered: s.bottlesOrdered,
        provided: s.emptiesProvided,
        sold: s.sold,
        loaned: s.loaned,
      })),
    };
  },

  /**
   * Aplica o settlement na confirmação real da entrega (motorista), por vasilhame:
   * empresta faltantes elegíveis (LOAN_OUT + estoque DEPOSIT_LOAN_OUT) e abate
   * dívida com vazios excedentes (RETURN_IN, somente ledger).
   * Idempotente por order_id.
   */
  async settleDelivery(
    params: {
      orderId: string;
      distributorId: string;
      consumerId: string;
      items: Array<{ product_id: string; quantity: number }>;
      collectedEmpties: number;
      actor: { type: ActorType; id: string };
      sourceApp: SourceApp;
    },
    tx: TxClient
  ): Promise<{ loaned: number; returnedFromLoan: number }> {
    const existing = await depositRepository.findMovementsByOrder(params.orderId, tx);
    if (existing.length > 0) {
      log.info({ orderId: params.orderId }, "Deposit settlement already applied (idempotent noop)");
      return { loaned: 0, returnedFromLoan: 0 };
    }

    const groups = await resolveBottleGroups(params.items, tx);
    if (groups.length === 0) return { loaned: 0, returnedFromLoan: 0 };

    // Aloca os vazios coletados (um total) entre os grupos, gulosamente por demanda.
    const emptiesByBottle = new Map<string, number>();
    let remainingEmpties = params.collectedEmpties;
    for (const g of groups) {
      const give = Math.min(remainingEmpties, g.bottlesOrdered);
      emptiesByBottle.set(g.bottleProductId, give);
      remainingEmpties -= give;
    }
    // Sobra de vazios (acima dos pedidos) → primeiro grupo, para abater dívida.
    if (remainingEmpties > 0 && groups.length > 0) {
      const first = groups[0].bottleProductId;
      emptiesByBottle.set(first, (emptiesByBottle.get(first) ?? 0) + remainingEmpties);
    }

    const settled = await settlePerBottle(
      {
        distributorId: params.distributorId,
        consumerId: params.consumerId,
        groups,
        emptiesByBottle,
      },
      tx
    );

    const occurredAt = new Date();
    let totalLoaned = 0;
    let totalReturned = 0;

    for (const s of settled) {
      if (!s.bottleInventoryItemId) continue;

      // Empréstimo
      if (s.loaned > 0) {
        try {
          await inventoryService.applyMovement(
            {
              distributorId: params.distributorId,
              inventoryItemId: s.bottleInventoryItemId,
              quantityDelta: -s.loaned,
              movementType: InventoryMovementType.DEPOSIT_LOAN_OUT,
              actor: params.actor,
              sourceApp: params.sourceApp,
              reference: { type: InventoryReferenceType.ORDER, id: params.orderId },
              metadata: { origin: "deposit_loan", order_id: params.orderId, bottle_product_id: s.bottleProductId },
            },
            tx
          );
        } catch (error) {
          log.warn(
            { orderId: params.orderId, error: (error as Error).message },
            "Deposit loan inventory movement skipped"
          );
        }

        await depositRepository.applyBalanceDelta(
          params.distributorId,
          params.consumerId,
          s.bottleInventoryItemId,
          s.loaned,
          occurredAt,
          tx
        );
        await depositRepository.createMovement(
          {
            distributorId: params.distributorId,
            consumerId: params.consumerId,
            inventoryItemId: s.bottleInventoryItemId,
            bottlesDelta: s.loaned,
            movementType: DepositMovementType.LOAN_OUT,
            actorType: params.actor.type,
            actorId: params.actor.id,
            sourceApp: params.sourceApp,
            orderId: params.orderId,
            occurredAt,
          },
          tx
        );
        await auditRepository.emit(
          {
            eventType: AuditEventType.DEPOSIT_BOTTLES_LOANED,
            actor: params.actor,
            orderId: params.orderId,
            sourceApp: params.sourceApp,
            payload: { bottles: s.loaned, inventory_item_id: s.bottleInventoryItemId },
          },
          tx
        );
        totalLoaned += s.loaned;
      }

      // Abatimento: vazios excedentes ao pedido reduzem a dívida (somente ledger).
      const surplus = Math.max(0, s.emptiesProvided - s.bottlesOrdered);
      if (surplus > 0) {
        const balance = await depositRepository.findBalance(
          params.distributorId,
          params.consumerId,
          s.bottleInventoryItemId,
          tx
        );
        const current = balance?.bottles_on_loan ?? 0;
        const returned = Math.min(surplus, current);
        if (returned > 0) {
          await depositRepository.applyBalanceDelta(
            params.distributorId,
            params.consumerId,
            s.bottleInventoryItemId,
            -returned,
            occurredAt,
            tx
          );
          await depositRepository.createMovement(
            {
              distributorId: params.distributorId,
              consumerId: params.consumerId,
              inventoryItemId: s.bottleInventoryItemId,
              bottlesDelta: -returned,
              movementType: DepositMovementType.RETURN_IN,
              actorType: params.actor.type,
              actorId: params.actor.id,
              sourceApp: params.sourceApp,
              orderId: params.orderId,
              occurredAt,
            },
            tx
          );
          await auditRepository.emit(
            {
              eventType: AuditEventType.DEPOSIT_BOTTLES_RETURNED,
              actor: params.actor,
              orderId: params.orderId,
              sourceApp: params.sourceApp,
              payload: { bottles: returned, inventory_item_id: s.bottleInventoryItemId },
            },
            tx
          );
          totalReturned += returned;
        }
      }
    }

    log.info(
      { orderId: params.orderId, loaned: totalLoaned, returnedFromLoan: totalReturned },
      "Deposit settlement applied"
    );
    return { loaned: totalLoaned, returnedFromLoan: totalReturned };
  },
};
