import type { Request, Response } from "express";
import type { Product } from "@prisma/client";
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
  distributorQueueQuerySchema,
  consumerOrdersQuerySchema,
} from "@xua/shared/schemas/order";
import { logger } from "../../../infra/logger/index.js";

/** Helper: mapeia OrderServiceError para HTTP status */
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

const ORDER_ACTION_ROLES: Record<string, string[]> = {
  accept: ["distributor_admin"],
  reject: ["distributor_admin"],
  assign_driver: ["distributor_admin"],
  complete_checklist: ["distributor_admin"],
  dispatch: ["distributor_admin"],
  dispatch_with_checklist: ["distributor_admin"],
  deliver: ["driver"],
  verify_otp: ["driver"],
  delivery_failed: ["driver"],
  cancel: ["consumer", "distributor_admin", "driver", "ops"],
  otp_override: ["ops", "support"],
  schedule_redelivery: ["ops", "support"],
};

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
   * PATCH /api/orders/:id
   * Ações de mudança de estado no pedido.
   */
  async action(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;
    const { action, ...payload } = req.body;

    try {
      // SEC-05: Verifica ownership antes de permitir ação
      const existing = await orderRepository.findById(id);
      if (!existing) {
        res.status(404).json({ error: "Pedido não encontrado" });
        return;
      }
      if (!(await orderPolicy.canAccess(existing, user.sub, user.role))) {
        res.status(403).json({ error: "Acesso negado" });
        return;
      }

      const allowedRoles = typeof action === "string" ? ORDER_ACTION_ROLES[action] : undefined;
      if (allowedRoles && !allowedRoles.includes(user.role)) {
        res.status(403).json({ error: "Acesso negado" });
        return;
      }

      let updatedOrder;

      switch (action) {
        case "accept":
          updatedOrder = await orderService.acceptOrder(id, user.sub);
          break;

        case "reject":
          const rejectParsed = rejectOrderSchema.safeParse(payload);
          if (!rejectParsed.success) {
            res.status(400).json({ error: rejectParsed.error.issues[0].message });
            return;
          }
          updatedOrder = await orderService.rejectOrder(
            id,
            user.sub,
            rejectParsed.data.reason,
            rejectParsed.data.details
          );
          break;

        case "assign_driver":
          if (!payload.driver_id || typeof payload.driver_id !== "string") {
            res.status(400).json({ error: "ID do motorista obrigatório" });
            return;
          }
          updatedOrder = await orderService.assignDriver(id, user.sub, payload.driver_id);
          break;

        case "complete_checklist":
          updatedOrder = await orderService.completeChecklist(id, user.sub);
          break;

        case "dispatch": {
          if (!payload.driver_id || typeof payload.driver_id !== "string") {
            res.status(400).json({ error: "ID do motorista obrigatório" });
            return;
          }
          // OTP já é gerado dentro da mesma transação do dispatch (ver orderService.dispatch)
          const dispatchResult = await orderService.dispatch(id, user.sub, payload.driver_id);
          // Envia OTP em tempo real ao consumer via Socket.IO
          getIO().to(`consumer:${dispatchResult.order.consumer_id}`).emit("otp_generated", {
            orderId: id,
            code: dispatchResult.otpCode,
          });
          res.json({ order: dispatchResult.order, otp: dispatchResult.otpCode });
          return;
        }

        case "dispatch_with_checklist": {
          if (!payload.driver_id || typeof payload.driver_id !== "string") {
            res.status(400).json({ error: "ID do motorista obrigatório" });
            return;
          }
          const dispatchChecklistResult = await orderService.dispatchWithChecklist(
            id,
            user.sub,
            payload.driver_id
          );
          // Envia OTP em tempo real ao consumer via Socket.IO
          getIO().to(`consumer:${dispatchChecklistResult.order.consumer_id}`).emit("otp_generated", {
            orderId: id,
            code: dispatchChecklistResult.otpCode,
          });
          res.json({ order: dispatchChecklistResult.order, otp: dispatchChecklistResult.otpCode });
          return;
        }

        case "deliver":
          updatedOrder = await orderService.deliverOrder(id, user.sub);
          break;

        case "verify_otp":
          if (!payload.code) {
            res.status(400).json({ error: "Código OTP obrigatório" });
            return;
          }
          const validation = await otpService.validate(id, payload.code, user.sub);
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
          updatedOrder = await orderService.deliverOrder(id, user.sub);
          break;

        case "otp_override":
          // Defesa em profundidade: já bloqueado acima por ORDER_ACTION_ROLES,
          // mas mantido aqui para não depender só desse mapa numa ação sensível
          // (bypass de OTP) caso ele seja alterado no futuro sem revisão.
          if (user.role !== "ops" && user.role !== "support") {
            res.status(403).json({ error: "Apenas ops/support pode fazer override de OTP" });
            return;
          }
          if (!payload.reason) {
            res.status(400).json({ error: "Motivo obrigatório para override" });
            return;
          }
          await otpService.override(id, user.sub, payload.reason);
          updatedOrder = await orderService.deliverOrder(id, user.sub);
          break;

        case "cancel":
          const actorType =
            user.role === "consumer"
              ? "consumer"
              : user.role === "distributor_admin"
                ? "distributor"
                : user.role === "driver"
                  ? "driver"
                  : "ops";
          updatedOrder = await orderService.cancelOrder(
            id,
            user.sub,
            actorType,
            payload.reason ?? "Cancelado pelo usuário",
            stockReturnOptions(payload)
          );
          break;

        case "delivery_failed":
          if (!payload.reason) {
            res.status(400).json({ error: "Motivo obrigatório" });
            return;
          }
          updatedOrder = await orderService.markDeliveryFailed(
            id,
            user.sub,
            payload.reason,
            stockReturnOptions(payload)
          );
          break;

        case "schedule_redelivery":
          // Defesa em profundidade (ver comentário em "otp_override" acima).
          if (user.role !== "ops" && user.role !== "support") {
            res.status(403).json({ error: "Apenas ops/support pode reagendar entregas" });
            return;
          }
          if (!payload.new_date) {
            res.status(400).json({ error: "Nova data obrigatória" });
            return;
          }
          updatedOrder = await orderService.scheduleRedelivery(id, user.sub, new Date(payload.new_date));
          break;

        default:
          res.status(400).json({ error: "Ação desconhecida" });
          return;
      }

      res.json({ order: updatedOrder });
    } catch (error) {
      if (error instanceof OrderServiceError || error instanceof OtpServiceError) {
        res.status(errorStatus(error.code)).json({ error: error.message, code: error.code });
        return;
      }
      logger.error({ error }, "Error processing order action");
      res.status(500).json({ error: "Erro interno" });
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
