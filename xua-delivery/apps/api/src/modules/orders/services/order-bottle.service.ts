import type { Prisma } from "@prisma/client";
import type { Order } from "@prisma/client";
import {
  ActorType,
  AuditEventType,
  InventoryMovementType,
  InventoryReferenceType,
  OrderStatus,
  PaymentKind,
  PaymentStatus,
  SourceApp,
} from "@xua/shared/enums";
import { CASH_PAYMENT_METHOD } from "@xua/shared/mappers/payment";
import { getPrisma } from "../../../infra/prisma/client.js";
import { orderRepository } from "../repository/orders.repository.js";
import { auditRepository } from "../../audit/audit.repository.js";
import { inventoryRepository } from "../../inventory/repository/inventory.repository.js";
import { inventoryService } from "../../inventory/services/inventory.service.js";
import {
  depositSettlementService,
  type BottleSettlement,
} from "../../deposits/services/deposit-settlement.service.js";
import { createLogger } from "../../../infra/logger/index.js";
import { OrderServiceError } from "../errors.js";
import { translateInventoryError } from "./order-inventory.helpers.js";
import { orderEventsPublisher } from "./order-events.publisher.js";
import { CASH_PAYMENT_CAPTURABLE_STATUSES, CASH_PAYMENT_PROVIDER } from "./payment-constants.js";

const log = createLogger("orders");

type TxClient = Prisma.TransactionClient;

/**
 * Status em que registrar vasilhame faz sentido.
 *
 * Aceita os dois lados da conclusão: o passo de vasilhame roda junto da
 * confirmação do código (pedido ainda OUT_FOR_DELIVERY) e também isolado, para
 * correção posterior de um pedido já entregue. Qualquer outro status é registro
 * indevido — sem esta checagem era possível gravar vasilhame de um pedido
 * cancelado, recusado ou que sequer saiu para entrega.
 */
const BOTTLE_STEP_ALLOWED_STATUSES: ReadonlySet<string> = new Set([
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
]);

function assertBottleStepAllowed(status: string): void {
  if (!BOTTLE_STEP_ALLOWED_STATUSES.has(status)) {
    throw new OrderServiceError(
      "BOTTLE_STEP_INVALID_STATUS",
      "Pedido não está em uma etapa que permita registrar vasilhame"
    );
  }
}

/**
 * Como o motorista resolveu os vazios que faltaram (regra de vasilhame na entrega):
 * - "charge": entrega tudo e cobra o vasilhame faltante na porta;
 * - "partial": entrega só as unidades de refil que tiveram vazio.
 * (O cancelamento é o fluxo de falha de entrega.)
 */
export type BottleShortfallResolution = "charge" | "partial";

/** Como a cobrança extra foi recebida quando o pedido já estava pago online. */
export type ExtraPaymentMethod = "cash" | "card_on_delivery";

export type BottleExchangeData = {
  collectedQty: number;
  returnedQty: number;
  condition?: string;
  shortfallResolution?: BottleShortfallResolution;
  extraPaymentMethod?: ExtraPaymentMethod;
};

/**
 * Pedido criado sob a regra de vasilhame na entrega. Pedidos anteriores à regra
 * já cobraram o vasilhame na criação (teto = 0) e não podem ser cobrados de novo.
 */
function isBottleRuleOrder(order: Pick<Order, "max_bottle_charge_cents">): boolean {
  return order.max_bottle_charge_cents > 0;
}

/** Pagamento "na porta" (dinheiro/maquininha) ainda não capturado, se houver. */
async function findOpenOfflinePayment(orderId: string, tx: TxClient) {
  return tx.payment.findFirst({
    where: {
      order_id: orderId,
      kind: PaymentKind.ORDER,
      provider: CASH_PAYMENT_PROVIDER,
      status: { in: [...CASH_PAYMENT_CAPTURABLE_STATUSES] },
    },
    orderBy: { created_at: "asc" },
  });
}

/**
 * Vende na porta os vasilhames que faltaram: vira item do pedido, baixa o
 * estoque do vasilhame e soma ao valor a receber. Pedido já pago online ganha
 * uma cobrança avulsa "na porta" (dinheiro/maquininha).
 */
async function chargeMissingBottlesInTx(
  current: Order,
  driverId: string,
  shortfall: BottleSettlement[],
  extraPaymentMethod: ExtraPaymentMethod | undefined,
  tx: TxClient
): Promise<{ chargeCents: number; sold: number }> {
  const chargeCents = shortfall.reduce((acc, s) => acc + s.sold * s.bottleUnitPriceCents, 0);
  const sold = shortfall.reduce((acc, s) => acc + s.sold, 0);

  await orderRepository.createItems(
    current.id,
    shortfall.map((s) => ({
      product_id: s.bottleProductId,
      product_name: s.bottleProductName,
      unit_price_cents: s.bottleUnitPriceCents,
      quantity: s.sold,
    })),
    tx
  );

  for (const s of shortfall) {
    if (!s.bottleInventoryItemId) continue;
    try {
      await inventoryService.applyMovement(
        {
          distributorId: current.distributor_id,
          inventoryItemId: s.bottleInventoryItemId,
          quantityDelta: -s.sold,
          movementType: InventoryMovementType.BOTTLE_SALE_OUT,
          actor: { type: ActorType.DRIVER, id: driverId },
          sourceApp: SourceApp.DRIVER_WEB,
          reference: { type: InventoryReferenceType.ORDER, id: current.id },
          metadata: {
            origin: "bottle_sold_at_delivery",
            order_id: current.id,
            bottle_product_id: s.bottleProductId,
            quantity: s.sold,
          },
        },
        tx
      );
    } catch (error) {
      translateInventoryError(error);
    }
  }

  const offlinePayment = await findOpenOfflinePayment(current.id, tx);
  if (offlinePayment) {
    await tx.payment.update({
      where: { id: offlinePayment.id },
      data: { amount_cents: offlinePayment.amount_cents + chargeCents },
    });
  } else {
    await tx.payment.create({
      data: {
        order_id: current.id,
        kind: PaymentKind.ORDER,
        status: PaymentStatus.CREATED,
        amount_cents: chargeCents,
        payment_method: extraPaymentMethod ?? CASH_PAYMENT_METHOD,
        provider: CASH_PAYMENT_PROVIDER,
      },
    });
  }

  await orderRepository.update(
    current.id,
    {
      bottles_sold: current.bottles_sold + sold,
      bottle_charge_cents: current.bottle_charge_cents + chargeCents,
      total_cents: current.total_cents + chargeCents,
    },
    tx
  );

  return { chargeCents, sold };
}

/**
 * Entrega parcial: tira do pedido as unidades de refil sem vazio, devolve a
 * água ao estoque e reduz o valor a receber. Só para pedido pago na entrega —
 * pedido pago online exigiria estorno, então ali só cabe cobrar ou cancelar.
 */
async function deliverPartialInTx(
  current: Order,
  driverId: string,
  shortfall: BottleSettlement[],
  tx: TxClient
): Promise<{ removedUnits: number; removedCents: number }> {
  const offlinePayment = await findOpenOfflinePayment(current.id, tx);
  if (!offlinePayment) {
    throw new OrderServiceError(
      "PARTIAL_DELIVERY_NOT_ALLOWED",
      "Pedido pago online: cobre o vasilhame na porta ou registre a falha da entrega"
    );
  }

  const items = await tx.orderItem.findMany({
    where: { order_id: current.id },
    orderBy: { created_at: "asc" },
    include: { product: { select: { requires_empty_return: true, bottle_product_id: true } } },
  });

  const removeByBottle = new Map(shortfall.map((s) => [s.bottleProductId, s.sold]));
  const removedByProduct = new Map<string, number>();
  let removedUnits = 0;
  let removedCents = 0;

  for (const item of items) {
    const bottleId = item.product.bottle_product_id;
    if (!item.product.requires_empty_return || !bottleId) continue;
    const pending = removeByBottle.get(bottleId) ?? 0;
    const take = Math.min(pending, item.quantity);
    if (take === 0) continue;

    const quantity = item.quantity - take;
    await tx.orderItem.update({
      where: { id: item.id },
      data: {
        quantity,
        original_quantity: item.original_quantity ?? item.quantity,
        subtotal_cents: quantity * item.unit_price_cents,
      },
    });
    removeByBottle.set(bottleId, pending - take);
    removedByProduct.set(item.product_id, (removedByProduct.get(item.product_id) ?? 0) + take);
    removedUnits += take;
    removedCents += take * item.unit_price_cents;
  }

  const remainingUnits = items.reduce((acc, item) => acc + item.quantity, 0) - removedUnits;
  if (remainingUnits <= 0) {
    throw new OrderServiceError(
      "PARTIAL_DELIVERY_EMPTY",
      "Nenhum item teria vazio para troca: registre a falha da entrega"
    );
  }

  const inventoryItems = await inventoryRepository.findActiveInventoryItemsByProductIds(
    [...removedByProduct.keys()],
    tx
  );
  for (const inventoryItem of inventoryItems) {
    const quantity = inventoryItem.product_id ? removedByProduct.get(inventoryItem.product_id) : 0;
    if (!quantity) continue;
    try {
      await inventoryService.applyMovement(
        {
          distributorId: current.distributor_id,
          inventoryItemId: inventoryItem.id,
          quantityDelta: quantity,
          movementType: InventoryMovementType.PARTIAL_DELIVERY_RETURN,
          actor: { type: ActorType.DRIVER, id: driverId },
          sourceApp: SourceApp.DRIVER_WEB,
          reference: { type: InventoryReferenceType.ORDER, id: current.id },
          metadata: { origin: "partial_delivery_no_empty", order_id: current.id, quantity },
        },
        tx
      );
    } catch (error) {
      translateInventoryError(error);
    }
  }

  await tx.payment.update({
    where: { id: offlinePayment.id },
    data: { amount_cents: Math.max(0, offlinePayment.amount_cents - removedCents) },
  });

  await orderRepository.update(
    current.id,
    {
      subtotal_cents: current.subtotal_cents - removedCents,
      total_cents: current.total_cents - removedCents,
      bottles_full_ordered: Math.max(0, current.bottles_full_ordered - removedUnits),
    },
    tx
  );

  return { removedUnits, removedCents };
}

export type EmptyNotCollectedData = { reason: string; notes?: string };

/**
 * Passo do vasilhame: ou troca, ou motivo de não-coleta. Não existe terceira
 * opção — é essa exclusividade que permite exigir o registro na conclusão da
 * entrega.
 */
export type BottleStep =
  | ({ kind: "exchange" } & BottleExchangeData)
  | ({ kind: "not_collected" } & EmptyNotCollectedData);

/** Descreve o que foi gravado, para o chamador emitir os eventos pós-commit. */
export type BottleStepResult = {
  order: Order;
  consumerPayload: Record<string, unknown>;
  distributorPayload: Record<string, unknown>;
};

/**
 * Corpo da troca de vasilhame, para rodar DENTRO de uma transação existente.
 *
 * Separado do método público porque a conclusão da entrega precisa gravar o
 * vasilhame e mudar o status do pedido na MESMA transação. Em transações
 * distintas, uma poderia falhar sem a outra e o pedido voltaria a poder ficar
 * entregue sem registro de vasilhame — exatamente o problema que se quer fechar.
 */
async function recordBottleExchangeInTx(
  orderId: string,
  driverId: string,
  data: BottleExchangeData,
  tx: TxClient
): Promise<BottleStepResult> {
  const current = await orderRepository.findById(orderId, tx);
  if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
  if (current.driver_id !== driverId) {
    throw new OrderServiceError("FORBIDDEN", "Acesso negado");
  }
  assertBottleStepAllowed(current.status);

  let emptyReturnInventoryItem: Awaited<
    ReturnType<typeof inventoryRepository.findActiveReturnableEmptyItem>
  > = null;

  if (data.returnedQty > 0) {
    emptyReturnInventoryItem = await inventoryRepository.findActiveReturnableEmptyItem(tx);
    if (emptyReturnInventoryItem) {
      try {
        await inventoryService.applyMovement(
          {
            distributorId: current.distributor_id,
            inventoryItemId: emptyReturnInventoryItem.id,
            quantityDelta: data.returnedQty,
            movementType: InventoryMovementType.EMPTY_RETURN_IN,
            actor: { type: ActorType.DRIVER, id: driverId },
            sourceApp: SourceApp.DRIVER_WEB,
            reference: { type: InventoryReferenceType.ORDER, id: orderId },
            metadata: {
              origin: "bottle_exchange",
              order_id: orderId,
              distributor_id: current.distributor_id,
              driver_id: driverId,
              returned_empty_qty: data.returnedQty,
              collected_empty_qty: data.collectedQty,
              bottle_condition: data.condition ?? null,
              inventory_item_id: emptyReturnInventoryItem.id,
              inventory_item_code: emptyReturnInventoryItem.code,
            },
          },
          tx
        );
      } catch (error) {
        translateInventoryError(error);
      }
    } else {
      log.warn(
        { orderId, distributorId: current.distributor_id, returnedQty: data.returnedQty },
        "Bottle exchange recorded without returnable empty inventory item"
      );
    }
  }

  // Settlement de caução de vasilhames com contagem REAL da entrega:
  // empresta faltantes elegíveis e abate dívida com vazios excedentes.
  // Idempotente por order_id. Resolve vasilhames a partir dos itens refil.
  const orderItems = await orderRepository.findItemsByOrderId(orderId, tx);
  const { settled } = await depositSettlementService.settleDelivery(
    {
      orderId,
      distributorId: current.distributor_id,
      consumerId: current.consumer_id,
      items: orderItems,
      collectedEmpties: data.collectedQty,
      actor: { type: ActorType.DRIVER, id: driverId },
      sourceApp: SourceApp.DRIVER_WEB,
    },
    tx
  );

  // Regra de vasilhame na entrega: vazio que faltou (e não virou caução) é
  // resolvido aqui. Só na primeira conclusão — a correção de um pedido já
  // entregue não mexe mais em valores.
  const shortfall = settled.filter((s) => s.sold > 0);
  const adjustable =
    isBottleRuleOrder(current) &&
    current.status === OrderStatus.OUT_FOR_DELIVERY &&
    current.bottle_step_recorded_at == null;
  let resolution: Record<string, unknown> | null = null;

  if (adjustable && shortfall.length > 0) {
    if (!data.shortfallResolution) {
      throw new OrderServiceError(
        "BOTTLE_SHORTFALL_RESOLUTION_REQUIRED",
        "Faltaram vasilhames vazios: cobre o vasilhame, entregue parcial ou registre a falha"
      );
    }
    resolution =
      data.shortfallResolution === "charge"
        ? {
            kind: "charge",
            ...(await chargeMissingBottlesInTx(
              current,
              driverId,
              shortfall,
              data.extraPaymentMethod,
              tx
            )),
          }
        : { kind: "partial", ...(await deliverPartialInTx(current, driverId, shortfall, tx)) };

    await auditRepository.emit(
      {
        eventType: AuditEventType.ORDER_PRICING_FINALIZED,
        actor: { type: ActorType.DRIVER, id: driverId },
        orderId,
        sourceApp: SourceApp.DRIVER_WEB,
        payload: { origin: "bottle_shortfall", collected_empty_qty: data.collectedQty, ...resolution },
      },
      tx
    );
  }

  const ordered = settled.reduce((acc, s) => acc + s.bottlesOrdered, 0);
  const updated = await orderRepository.update(
    orderId,
    {
      collected_empty_qty: data.collectedQty,
      returned_empty_qty: data.returnedQty,
      bottle_condition: data.condition ?? null,
      bottle_step_recorded_at: new Date(),
      ...(adjustable && settled.length > 0
        ? {
            empty_bottles_provided: Math.min(data.collectedQty, ordered),
            bottles_loaned: settled.reduce((acc, s) => acc + s.loaned, 0),
          }
        : {}),
    },
    tx
  );

  await auditRepository.emit(
    {
      eventType: AuditEventType.BOTTLE_EXCHANGE_RECORDED,
      actor: { type: ActorType.DRIVER, id: driverId },
      orderId,
      sourceApp: SourceApp.DRIVER_WEB,
      payload: {
        collectedQty: data.collectedQty,
        returnedQty: data.returnedQty,
        condition: data.condition,
        inventory_movement_type:
          data.returnedQty > 0 && emptyReturnInventoryItem
            ? InventoryMovementType.EMPTY_RETURN_IN
            : null,
        inventory_item_id: emptyReturnInventoryItem?.id ?? null,
        shortfall_resolution: resolution,
      },
    },
    tx
  );

  return {
    order: updated,
    consumerPayload: {
      orderId,
      collectedEmptyQty: data.collectedQty,
      returnedEmptyQty: data.returnedQty,
      shortfallResolution: resolution,
    },
    distributorPayload: {
      orderId,
      driverId,
      collectedEmptyQty: data.collectedQty,
      returnedEmptyQty: data.returnedQty,
      bottleCondition: data.condition ?? null,
      shortfallResolution: resolution,
    },
  };
}

/** Corpo da não-coleta, para rodar DENTRO de uma transação existente. */
async function recordEmptyNotCollectedInTx(
  orderId: string,
  driverId: string,
  data: EmptyNotCollectedData,
  tx: TxClient
): Promise<BottleStepResult> {
  const current = await orderRepository.findById(orderId, tx);
  if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
  if (current.driver_id !== driverId) {
    throw new OrderServiceError("FORBIDDEN", "Acesso negado");
  }
  assertBottleStepAllowed(current.status);

  // Pedido com refil precisa da contagem de vazios para fechar o valor: a
  // não-coleta sem contagem deixaria o vasilhame faltante sem cobrança.
  if (current.status === OrderStatus.OUT_FOR_DELIVERY && isBottleRuleOrder(current)) {
    throw new OrderServiceError(
      "BOTTLE_COUNT_REQUIRED",
      "Pedido com troca de vasilhame: informe quantos vazios foram recebidos"
    );
  }

  const updated = await orderRepository.update(
    orderId,
    {
      empty_not_collected_reason: data.reason,
      empty_not_collected_notes: data.notes ?? null,
      bottle_step_recorded_at: new Date(),
    },
    tx
  );

  await auditRepository.emit(
    {
      eventType: AuditEventType.EMPTY_NOT_COLLECTED,
      actor: { type: ActorType.DRIVER, id: driverId },
      orderId,
      sourceApp: SourceApp.DRIVER_WEB,
      payload: { reason: data.reason, notes: data.notes },
    },
    tx
  );

  return {
    order: updated,
    consumerPayload: { orderId, notCollectedReason: data.reason },
    distributorPayload: { orderId, driverId, notCollectedReason: data.reason },
  };
}

/** Grava o passo do vasilhame (troca ou não-coleta) dentro de uma transação. */
export async function recordBottleStepInTx(
  orderId: string,
  driverId: string,
  step: BottleStep,
  tx: TxClient
): Promise<BottleStepResult> {
  return step.kind === "exchange"
    ? recordBottleExchangeInTx(orderId, driverId, step, tx)
    : recordEmptyNotCollectedInTx(orderId, driverId, step, tx);
}

/** Emite os eventos do passo de vasilhame. Sempre pós-commit. */
export function publishBottleStepEvents(result: BottleStepResult): void {
  orderEventsPublisher.notifyConsumer(
    result.order.consumer_id,
    "bottle_step_recorded",
    result.consumerPayload
  );
  orderEventsPublisher.notifyDistributor(
    result.order.distributor_id,
    "bottle_step_recorded",
    result.distributorPayload
  );
}

/**
 * orderBottleService — registro isolado de vasilhame.
 *
 * O caminho normal do motorista grava o vasilhame junto da conclusão da entrega
 * (ver deliverOrder). Estes métodos cobrem o registro avulso — correção de um
 * pedido já entregue, por exemplo.
 */
export const orderBottleService = {
  /**
   * Pré-checagem do passo de vasilhame, SEM gravar nada. Roda antes de
   * consumir o código do cliente: o OTP é marcado como usado na validação, e
   * uma conclusão recusada depois disso deixaria o motorista sem código.
   * Reaplica (em leitura) a mesma decisão de venda x caução da entrega.
   */
  async precheckBottleStep(orderId: string, step: BottleStep): Promise<void> {
    const current = await orderRepository.findById(orderId);
    if (!current || current.status !== OrderStatus.OUT_FOR_DELIVERY || current.bottle_step_recorded_at) {
      return;
    }
    if (step.kind === "not_collected") {
      if (isBottleRuleOrder(current)) {
        throw new OrderServiceError(
          "BOTTLE_COUNT_REQUIRED",
          "Pedido com troca de vasilhame: informe quantos vazios foram recebidos"
        );
      }
      return;
    }
    if (!isBottleRuleOrder(current)) return;

    const items = await orderRepository.findItemsByOrderId(orderId);
    const groups = await depositSettlementService.resolveBottleGroups(items);
    const emptiesByBottle = new Map<string, number>();
    let remaining = step.collectedQty;
    for (const g of groups) {
      const give = Math.min(remaining, g.bottlesOrdered);
      emptiesByBottle.set(g.bottleProductId, give);
      remaining -= give;
    }
    const settled = await depositSettlementService.settlePerBottle({
      distributorId: current.distributor_id,
      consumerId: current.consumer_id,
      groups,
      emptiesByBottle,
    });
    const missing = settled.reduce((acc, s) => acc + s.sold, 0);
    if (missing === 0) return;

    if (!step.shortfallResolution) {
      throw new OrderServiceError(
        "BOTTLE_SHORTFALL_RESOLUTION_REQUIRED",
        "Faltaram vasilhames vazios: cobre o vasilhame, entregue parcial ou registre a falha"
      );
    }
    if (step.shortfallResolution === "partial") {
      const prisma = getPrisma();
      const doorPayment = await findOpenOfflinePayment(orderId, prisma as unknown as TxClient);
      if (!doorPayment) {
        throw new OrderServiceError(
          "PARTIAL_DELIVERY_NOT_ALLOWED",
          "Pedido pago online: cobre o vasilhame na porta ou registre a falha da entrega"
        );
      }
      const totalUnits = items.reduce((acc, item) => acc + item.quantity, 0);
      if (totalUnits - missing <= 0) {
        throw new OrderServiceError(
          "PARTIAL_DELIVERY_EMPTY",
          "Nenhum item teria vazio para troca: registre a falha da entrega"
        );
      }
    }
  },

  async recordBottleExchange(
    orderId: string,
    driverId: string,
    data: BottleExchangeData
  ): Promise<Order> {
    const prisma = getPrisma();
    const result = await prisma.$transaction((tx: TxClient) =>
      recordBottleExchangeInTx(orderId, driverId, data, tx)
    );

    publishBottleStepEvents(result);
    return result.order;
  },

  async recordEmptyNotCollected(
    orderId: string,
    driverId: string,
    data: EmptyNotCollectedData
  ): Promise<Order> {
    const prisma = getPrisma();
    const result = await prisma.$transaction((tx: TxClient) =>
      recordEmptyNotCollectedInTx(orderId, driverId, data, tx)
    );

    publishBottleStepEvents(result);
    return result.order;
  },
};
