import type { Request, Response } from "express";
import type { Order, Product } from "@prisma/client";
import type { DeliveryWindow } from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { orderService, OrderServiceError } from "../services/orders.service.js";
import { orderPolicy } from "../policies/order.policy.js";
import { orderRepository } from "../repository/orders.repository.js";
import { otpService, OtpServiceError } from "../../driver/services/otp.service.js";
import { getIO } from "../../../infra/socket/gateway.js";
import { distributorService, DistributorServiceError, ScheduleServiceError } from "../../distributor/index.js";
import {
  createOrderSchema,
  ratingSchema,
  bottleExchangeSchema,
  nonCollectionSchema,
  rejectOrderSchema,
  assignDriverSchema,
  dispatchSchema,
  dispatchWithChecklistSchema,
  verifyOtpSchema,
  otpOverrideSchema,
  cancelOrderSchema,
  deliveryFailedSchema,
  scheduleRedeliverySchema,
  distributorQueueQuerySchema,
  consumerOrdersQuerySchema,
} from "@xua/shared/schemas/order";
import { logger } from "../../../infra/logger/index.js";

/** Helper: mapeia OrderServiceError/OtpServiceError para HTTP status */
function errorStatus(code: string): number {
  const map: Record<string, number> = {
    ORDER_NOT_FOUND: 404,
    FORBIDDEN: 403,
    INVALID_TRANSITION: 400,
    INVALID_STATUS: 400,
    ALREADY_RATED: 409,
    STOCK_UNAVAILABLE: 409,
    IDEMPOTENCY_CONFLICT: 409,
    INVENTORY_ITEM_NOT_FOUND: 400,
    INVENTORY_ITEM_INACTIVE: 400,
    INVENTORY_ITEM_CONFLICT: 409,
    OTP_NOT_FOUND: 404,
    OTP_EXPIRED: 400,
    OTP_LOCKED: 429,
    INVALID_CASH_CHANGE: 400,
    CASH_PAYMENT_INVALID: 409,
    PAYMENT_METHOD_NOT_ALLOWED: 400,
  };
  return map[code] ?? 400;
}

/** Encaminha erros conhecidos (OrderServiceError/OtpServiceError) para o status certo; o resto vira 500. */
function handleActionError(error: unknown, res: Response, logMessage: string): void {
  if (error instanceof OrderServiceError || error instanceof OtpServiceError) {
    res.status(errorStatus(error.code)).json({ error: error.message, code: error.code });
    return;
  }
  logger.error({ error }, logMessage);
  res.status(500).json({ error: "Erro interno" });
}

/**
 * SEC-05: carrega o pedido e verifica ownership antes de qualquer ação.
 * Responde 404/403 e retorna `null` quando o acesso já foi negado — o
 * chamador deve checar o retorno e simplesmente `return` nesse caso.
 */
async function loadOwnedOrder(req: Request, res: Response): Promise<Order | null> {
  const user = req.user!;
  const id = req.params.id as string;

  const existing = await orderRepository.findById(id);
  if (!existing) {
    res.status(404).json({ error: "Pedido não encontrado" });
    return null;
  }
  if (!(await orderPolicy.canAccess(existing, user.sub, user.role))) {
    res.status(403).json({ error: "Acesso negado" });
    return null;
  }
  return existing;
}

function stockReturnOptions(payload: Record<string, unknown>) {
  const value = payload.return_to_stock ?? payload.returned_to_stock ?? payload.physical_return_confirmed;
  return typeof value === "boolean" ? { returnToStock: value } : undefined;
}

/**
 * OrdersController — handlers HTTP para rotas de pedidos.
 */
export const ordersController = {
  /**
   * GET /api/orders
   * Lista pedidos com base no scope e role do usuário.
   */
  async list(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const scope = req.query.scope as string | undefined;
    const statusParam = req.query.status as string | undefined;

    try {
      // SEC-08: Scope support — busca por telefone/email/id
      if (scope === "support") {
        if (user.role !== "support" && user.role !== "ops") {
          res.status(403).json({ error: "Acesso negado" });
          return;
        }
        const q = ((req.query.q as string) ?? "").replace(/[%_\\]/g, "");
        if (q.length < 3) {
          res.status(400).json({ error: "Busca deve ter ao menos 3 caracteres" });
          return;
        }
        const orders = await orderService.searchOrders(q);
        const mapped = orders.map((order: any) => ({
          ...order,
          consumer: undefined,
          consumer_name: order.consumer.name,
          consumer_email: order.consumer.email,
          consumer_phone: order.consumer.phone,
        }));
        res.json({ orders: mapped });
        return;
      }

      if (scope === "distributor") {
        if (user.role !== "distributor_admin") {
          res.status(403).json({ error: "Acesso negado" });
          return;
        }

        const parsed = distributorQueueQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          res.status(400).json({
            error: parsed.error.issues[0]?.message ?? "Query inválida",
            code: "INVALID_QUERY",
          });
          return;
        }

        const result = await orderService.listDistributorQueue(user.sub, user.role, parsed.data);
        res.json(result);
        return;
      }

      const parsedQuery = consumerOrdersQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        res.status(400).json({
          error: parsedQuery.error.issues[0]?.message ?? "Query inválida",
          code: "INVALID_QUERY",
        });
        return;
      }

      const result = await orderService.listOrders(
        user.sub,
        user.role,
        scope,
        statusParam,
        parsedQuery.data.page,
        parsedQuery.data.limit,
        parsedQuery.data.statusGroup
      );

      // Consumer returns paginated envelope; other roles return plain array
      if (Array.isArray(result)) {
        res.json({ orders: result });
      } else {
        res.json(result);
      }
    } catch (error) {
      if (error instanceof OrderServiceError) {
        res.status(errorStatus(error.code)).json({ error: error.message, code: error.code });
        return;
      }
      logger.error({ error }, "Error listing orders");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /**
   * POST /api/orders
   * Cria novo pedido.
   */
  async create(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const prisma = getPrisma();

    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      // FUNC-03: Resolve zona e distribuidor pelo endereço
      const address = await prisma.address.findFirst({
        where: { id: parsed.data.address_id, consumer_id: user.sub },
      });
      if (!address) {
        res.status(404).json({ error: "Endereço não encontrado" });
        return;
      }
      if (!address.zone_id) {
        res.status(400).json({ error: "Endereço sem zona de entrega configurada" });
        return;
      }

      const zone = await prisma.zone.findFirst({
        where: { id: address.zone_id, is_active: true },
      });
      if (!zone) {
        res.status(400).json({ error: "Zona de entrega inativa" });
        return;
      }

      // Busca preços reais dos produtos
      const productIds = parsed.data.items.map((i) => i.product_id);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds }, is_active: true },
      });
      if (products.length !== productIds.length) {
        res.status(400).json({ error: "Um ou mais produtos inválidos ou inativos" });
        return;
      }

      const productMap = new Map(products.map((p: Product) => [p.id, p] as const));

      // Resolve distribuidora: manual (se informado) ou automática
      const resolved = await distributorService.resolveDistributor(
        user.sub,
        zone.id,
        parsed.data.delivery_date,
        parsed.data.delivery_window,
        parsed.data.distributor_id,
      );

      const order = await orderService.createOrder({
        consumerId: user.sub,
        addressId: parsed.data.address_id,
        distributorId: resolved.distributorId,
        zoneId: resolved.zoneId,
        deliveryDate: parsed.data.delivery_date,
        deliveryWindow: parsed.data.delivery_window.toUpperCase() as DeliveryWindow,
        distributorSelectionMode: resolved.mode,
        timeSlotId: parsed.data.time_slot_id ?? null,
        paymentMethod: parsed.data.payment_method,
        cashChangeForCents: parsed.data.cash_change_for_cents ?? null,
        emptyBottles: parsed.data.empty_bottles,
        items: parsed.data.items.map((i) => {
          const product = productMap.get(i.product_id)!;
          return {
            product_id: i.product_id,
            product_name: product.name,
            unit_price_cents: product.price_cents,
            quantity: i.quantity,
          };
        }),
      });
      res.status(201).json({ order });
    } catch (error) {
      if (error instanceof OrderServiceError) {
        res.status(errorStatus(error.code)).json({ error: error.message, code: error.code });
        return;
      }
      if (error instanceof ScheduleServiceError) {
        res.status(error.status).json({ error: error.message, code: error.code });
        return;
      }
      if (error instanceof DistributorServiceError) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof Error) {
        if (error.message === "SLOT_FULL") {
          res.status(409).json({ error: "Horário de entrega esgotado" });
          return;
        }
        if (error.message === "SLOT_NOT_FOUND") {
          res.status(404).json({ error: "Horário de entrega não disponível" });
          return;
        }
      }
      logger.error({ error }, "Error creating order");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /**
   * GET /api/orders/:id
   * Busca detalhes de um pedido com timeline.
   */
  async getById(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    try {
      const detail = await orderService.getOrderDetail(id, user.role);
      if (!detail) {
        res.status(404).json({ error: "Pedido não encontrado" });
        return;
      }

      if (!(await orderPolicy.canAccess(detail, user.sub, user.role))) {
        res.status(403).json({ error: "Acesso negado" });
        return;
      }

      res.json({ order: detail });
    } catch (error) {
      logger.error({ error }, "Error fetching order");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /**
   * PATCH /api/orders/:id/accept
   * Distribuidor aceita o pedido.
   */
  async accept(req: Request, res: Response): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req, res);
      if (!existing) return;

      const updatedOrder = await orderService.acceptOrder(existing.id, req.user!.sub);
      res.json({ order: updatedOrder });
    } catch (error) {
      handleActionError(error, res, "Error accepting order");
    }
  },

  /**
   * PATCH /api/orders/:id/reject
   * Distribuidor rejeita o pedido.
   */
  async reject(req: Request, res: Response): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req, res);
      if (!existing) return;

      const parsed = rejectOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const updatedOrder = await orderService.rejectOrder(
        existing.id,
        req.user!.sub,
        parsed.data.reason,
        parsed.data.details
      );
      res.json({ order: updatedOrder });
    } catch (error) {
      handleActionError(error, res, "Error rejecting order");
    }
  },

  /**
   * PATCH /api/orders/:id/assign-driver
   * Distribuidor atribui (ou reatribui) motorista ao pedido.
   */
  async assignDriver(req: Request, res: Response): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req, res);
      if (!existing) return;

      const parsed = assignDriverSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const updatedOrder = await orderService.assignDriver(existing.id, req.user!.sub, parsed.data.driver_id);
      res.json({ order: updatedOrder });
    } catch (error) {
      handleActionError(error, res, "Error assigning driver");
    }
  },

  /**
   * PATCH /api/orders/:id/complete-checklist
   * Distribuidor completa o checklist de despacho.
   */
  async completeChecklist(req: Request, res: Response): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req, res);
      if (!existing) return;

      const updatedOrder = await orderService.completeChecklist(existing.id, req.user!.sub);
      res.json({ order: updatedOrder });
    } catch (error) {
      handleActionError(error, res, "Error completing checklist");
    }
  },

  /**
   * PATCH /api/orders/:id/dispatch
   * Distribuidor despacha o pedido (gera OTP).
   */
  async dispatch(req: Request, res: Response): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req, res);
      if (!existing) return;

      const parsed = dispatchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const result = await orderService.dispatch(existing.id, req.user!.sub, parsed.data.driver_id);
      // Envia OTP em tempo real ao consumer via Socket.IO
      getIO().to(`consumer:${result.order.consumer_id}`).emit("otp_generated", {
        orderId: existing.id,
        code: result.otpCode,
      });
      res.json({ order: result.order, otp: result.otpCode });
    } catch (error) {
      handleActionError(error, res, "Error dispatching order");
    }
  },

  /**
   * PATCH /api/orders/:id/dispatch-with-checklist
   * Checklist + dispatch numa única chamada (gera OTP).
   */
  async dispatchWithChecklist(req: Request, res: Response): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req, res);
      if (!existing) return;

      const parsed = dispatchWithChecklistSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const result = await orderService.dispatchWithChecklist(existing.id, req.user!.sub, parsed.data.driver_id);
      getIO().to(`consumer:${result.order.consumer_id}`).emit("otp_generated", {
        orderId: existing.id,
        code: result.otpCode,
      });
      res.json({ order: result.order, otp: result.otpCode });
    } catch (error) {
      handleActionError(error, res, "Error dispatching order with checklist");
    }
  },

  /**
   * PATCH /api/orders/:id/deliver
   * Motorista confirma entrega (sem validar OTP — uso administrativo/teste).
   */
  async deliver(req: Request, res: Response): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req, res);
      if (!existing) return;

      const updatedOrder = await orderService.deliverOrder(existing.id, req.user!.sub);
      res.json({ order: updatedOrder });
    } catch (error) {
      handleActionError(error, res, "Error delivering order");
    }
  },

  /**
   * PATCH /api/orders/:id/verify-otp
   * Motorista valida o código informado pelo cliente e confirma a entrega.
   */
  async verifyOtp(req: Request, res: Response): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req, res);
      if (!existing) return;

      const parsed = verifyOtpSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const validation = await otpService.validate(existing.id, parsed.data.code, req.user!.sub);
      if (!validation.isValid) {
        res.status(validation.locked ? 429 : 400).json({
          error: validation.locked
            ? "Código bloqueado por excesso de tentativas"
            : "Código incorreto",
          code: validation.locked ? "OTP_LOCKED" : "OTP_INVALID",
          attempts: validation.attempts,
          max_attempts: validation.maxAttempts,
        });
        return;
      }

      const updatedOrder = await orderService.deliverOrder(existing.id, req.user!.sub);
      res.json({ order: updatedOrder });
    } catch (error) {
      handleActionError(error, res, "Error verifying OTP");
    }
  },

  /**
   * PATCH /api/orders/:id/otp-override
   * Ops/support faz bypass do OTP (sempre com motivo obrigatório).
   */
  async otpOverride(req: Request, res: Response): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req, res);
      if (!existing) return;

      const parsed = otpOverrideSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      await otpService.override(existing.id, req.user!.sub, parsed.data.reason);
      const updatedOrder = await orderService.deliverOrder(existing.id, req.user!.sub);
      res.json({ order: updatedOrder });
    } catch (error) {
      handleActionError(error, res, "Error overriding OTP");
    }
  },

  /**
   * PATCH /api/orders/:id/cancel
   * Cancela o pedido (consumer, distributor_admin, driver ou ops).
   */
  async cancel(req: Request, res: Response): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req, res);
      if (!existing) return;

      const parsed = cancelOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const user = req.user!;
      const actorType =
        user.role === "consumer"
          ? "consumer"
          : user.role === "distributor_admin"
            ? "distributor"
            : user.role === "driver"
              ? "driver"
              : "ops";

      const updatedOrder = await orderService.cancelOrder(
        existing.id,
        user.sub,
        actorType,
        parsed.data.reason ?? "Cancelado pelo usuário",
        stockReturnOptions(parsed.data)
      );
      res.json({ order: updatedOrder });
    } catch (error) {
      handleActionError(error, res, "Error cancelling order");
    }
  },

  /**
   * PATCH /api/orders/:id/delivery-failed
   * Motorista registra falha na entrega.
   */
  async deliveryFailed(req: Request, res: Response): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req, res);
      if (!existing) return;

      const parsed = deliveryFailedSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const updatedOrder = await orderService.markDeliveryFailed(
        existing.id,
        req.user!.sub,
        parsed.data.reason,
        stockReturnOptions(parsed.data)
      );
      res.json({ order: updatedOrder });
    } catch (error) {
      handleActionError(error, res, "Error marking delivery failed");
    }
  },

  /**
   * PATCH /api/orders/:id/schedule-redelivery
   * Ops/support agenda uma reentrega.
   */
  async scheduleRedelivery(req: Request, res: Response): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req, res);
      if (!existing) return;

      const parsed = scheduleRedeliverySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const updatedOrder = await orderService.scheduleRedelivery(
        existing.id,
        req.user!.sub,
        new Date(parsed.data.new_date)
      );
      res.json({ order: updatedOrder });
    } catch (error) {
      handleActionError(error, res, "Error scheduling redelivery");
    }
  },

  /**
   * POST /api/orders/:id/rating
   * Submete avaliação NPS.
   */
  async submitRating(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    const parsed = ratingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const order = await orderService.submitRating(id, user.sub, parsed.data.rating, parsed.data.comment);
      res.json({ order });
    } catch (error) {
      if (error instanceof OrderServiceError) {
        res.status(errorStatus(error.code)).json({ error: error.message, code: error.code });
        return;
      }
      logger.error({ error }, "Error submitting rating");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /**
   * POST /api/orders/:id/bottle-exchange
   * Registra troca de vasilhame.
   */
  async recordBottleExchange(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    const parsed = bottleExchangeSchema.safeParse({ ...req.body, driver_id: user.sub });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const order = await orderService.recordBottleExchange(id, user.sub, {
        // Vazios coletados do consumidor (settlement). Default = returned_empty_qty (compat).
        collectedQty: parsed.data.collected_empty_qty ?? parsed.data.returned_empty_qty,
        returnedQty: parsed.data.returned_empty_qty,
        condition: parsed.data.bottle_condition,
      });
      res.json({ order });
    } catch (error) {
      if (error instanceof OrderServiceError) {
        res.status(errorStatus(error.code)).json({ error: error.message, code: error.code });
        return;
      }
      logger.error({ error }, "Error recording bottle exchange");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /**
   * POST /api/orders/:id/empty-not-collected
   * Registra vasilhame não coletado.
   */
  async recordEmptyNotCollected(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    const parsed = nonCollectionSchema.safeParse({ ...req.body, driver_id: user.sub });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const order = await orderService.recordEmptyNotCollected(id, user.sub, {
        reason: parsed.data.reason,
        notes: parsed.data.notes,
      });
      res.json({ order });
    } catch (error) {
      if (error instanceof OrderServiceError) {
        res.status(errorStatus(error.code)).json({ error: error.message, code: error.code });
        return;
      }
      logger.error({ error }, "Error recording empty not collected");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
