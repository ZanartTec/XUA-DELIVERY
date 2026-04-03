import type { Request, Response } from "express";
import type { Order, Consumer, OrderItem, Product, AuditEvent } from "@prisma/client";
import { DeliveryWindow, OrderStatus } from "@prisma/client";
import { getPrisma } from "../../infra/prisma/client.js";
import { orderService, OrderServiceError } from "./orders.service.js";
import { orderRepository } from "./orders.repository.js";
import { otpService } from "../driver/otp.service.js";
import { createOrderSchema, ratingSchema, bottleExchangeSchema, nonCollectionSchema } from "@xua/shared/schemas/order";
import { logger } from "../../infra/logger/index.js";

// SEC-05: Verifica se o usuário tem acesso ao pedido
function canAccess(
  order: { consumer_id: string; distributor_id: string; driver_id: string | null },
  userId: string,
  role: string
): boolean {
  if (role === "ops" || role === "support") return true;
  if (role === "consumer" && order.consumer_id === userId) return true;
  if (role === "distributor_admin" && order.distributor_id === userId) return true;
  if (role === "driver" && order.driver_id === userId) return true;
  return false;
}

// Helper type for order with consumer
type OrderWithConsumer = Order & { consumer: Pick<Consumer, "name" | "email" | "phone"> };

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
    const prisma = getPrisma();

    try {
      // SEC-12: Scope distributor
      if (scope === "distributor") {
        if (user.role !== "distributor_admin") {
          res.status(403).json({ error: "Acesso negado" });
          return;
        }
        const statusEnum = statusParam ? (statusParam as OrderStatus) : undefined;
        const orders = await orderRepository.findByDistributor(user.sub, statusEnum);
        res.json({ orders });
        return;
      }

      // SEC-08: Scope support
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

        const orders = await prisma.order.findMany({
          where: {
            OR: [
              { consumer: { phone: { contains: q } } },
              { consumer: { email: { contains: q } } },
              { id: q },
            ],
          },
          include: {
            consumer: {
              select: { name: true, email: true, phone: true },
            },
          },
          orderBy: { created_at: "desc" },
          take: 50,
        });

        const mapped = orders.map((order: OrderWithConsumer) => ({
          ...order,
          consumer: undefined,
          consumer_name: order.consumer.name,
          consumer_email: order.consumer.email,
          consumer_phone: order.consumer.phone,
        }));
        res.json({ orders: mapped });
        return;
      }

      // Default: lista pedidos do consumer
      if (user.role === "consumer") {
        const orders = await orderRepository.findByConsumer(user.sub);
        res.json({ orders });
        return;
      }

      // Ops/admin pode ver todos
      if (user.role === "ops" || user.role === "support") {
        const orders = await orderRepository.findAll({
          limit: 100,
          ...(statusParam ? { status: statusParam as OrderStatus } : {}),
        });
        res.json({ orders });
        return;
      }

      res.json({ orders: [] });
    } catch (error) {
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
      const windowEnum =
        parsed.data.delivery_window === "morning" ? DeliveryWindow.MORNING : DeliveryWindow.AFTERNOON;

      const order = await orderService.createOrder({
        consumerId: user.sub,
        addressId: parsed.data.address_id,
        distributorId: zone.distributor_id,
        zoneId: zone.id,
        deliveryDate: parsed.data.delivery_date,
        deliveryWindow: windowEnum,
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
    const prisma = getPrisma();

    try {
      const order = await prisma.order.findUnique({ where: { id } });
      if (!order) {
        res.status(404).json({ error: "Pedido não encontrado" });
        return;
      }

      if (!canAccess(order, user.sub, user.role)) {
        res.status(403).json({ error: "Acesso negado" });
        return;
      }

      const items = await prisma.orderItem.findMany({
        where: { order_id: id },
        select: {
          quantity: true,
          unit_price_cents: true,
          product: { select: { name: true } },
        },
      });

      const events = await prisma.auditEvent.findMany({
        where: { order_id: id },
        orderBy: { occurred_at: "asc" },
        select: { event_type: true, occurred_at: true, actor_id: true },
      });

      res.json({
        order: {
          ...order,
          items: items.map((i: { quantity: number; unit_price_cents: number; product: { name: string } }) => ({
            product_name: i.product.name,
            qty: i.quantity,
            unit_price_cents: i.unit_price_cents,
          })),
          events: events.map((e: { event_type: string; occurred_at: Date; actor_id: string }) => ({
            status: e.event_type,
            timestamp: e.occurred_at,
            actor: e.actor_id,
          })),
        },
      });
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
    const prisma = getPrisma();

    try {
      // SEC-05: Verifica ownership antes de permitir ação
      const existing = await prisma.order.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: "Pedido não encontrado" });
        return;
      }
      if (!canAccess(existing, user.sub, user.role)) {
        res.status(403).json({ error: "Acesso negado" });
        return;
      }

      let updatedOrder;

      switch (action) {
        case "accept":
          updatedOrder = await orderService.acceptOrder(id, user.sub);
          break;

        case "reject":
          if (!payload.reason) {
            res.status(400).json({ error: "Motivo obrigatório" });
            return;
          }
          updatedOrder = await orderService.rejectOrder(id, user.sub, payload.reason, payload.details);
          break;

        case "complete_checklist":
          updatedOrder = await orderService.completeChecklist(id, user.sub);
          break;

        case "dispatch":
          if (!payload.driver_id) {
            res.status(400).json({ error: "ID do motorista obrigatório" });
            return;
          }
          updatedOrder = await orderService.dispatch(id, user.sub, payload.driver_id);
          // Gera OTP após dispatch
          const otpCode = await otpService.generate(id, user.sub);
          // Retorna OTP junto com o pedido para ser enviado ao consumer
          res.json({ order: updatedOrder, otp: otpCode });
          return;

        case "deliver":
          updatedOrder = await orderService.deliverOrder(id, user.sub);
          break;

        case "verify_otp":
          if (!payload.code) {
            res.status(400).json({ error: "Código OTP obrigatório" });
            return;
          }
          const valid = await otpService.validate(id, payload.code, user.sub);
          if (!valid) {
            res.status(400).json({ error: "Código inválido ou expirado" });
            return;
          }
          updatedOrder = await orderService.deliverOrder(id, user.sub);
          break;

        case "otp_override":
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
                : "ops";
          updatedOrder = await orderService.cancelOrder(
            id,
            user.sub,
            actorType,
            payload.reason ?? "Cancelado pelo usuário"
          );
          break;

        case "delivery_failed":
          if (!payload.reason) {
            res.status(400).json({ error: "Motivo obrigatório" });
            return;
          }
          updatedOrder = await orderService.markDeliveryFailed(id, user.sub, payload.reason);
          break;

        case "schedule_redelivery":
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

      const order = await prisma.order.findUnique({ where: { id } });
      res.json({ order: order ?? updatedOrder });
    } catch (error) {
      if (error instanceof OrderServiceError) {
        const statusMap: Record<string, number> = {
          ORDER_NOT_FOUND: 404,
          FORBIDDEN: 403,
          INVALID_TRANSITION: 400,
          INVALID_STATUS: 400,
          OTP_NOT_FOUND: 404,
          OTP_EXPIRED: 400,
          OTP_LOCKED: 429,
        };
        const status = statusMap[error.code] ?? 400;
        res.status(status).json({ error: error.message, code: error.code });
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
        const statusMap: Record<string, number> = {
          ORDER_NOT_FOUND: 404,
          FORBIDDEN: 403,
          INVALID_STATUS: 400,
        };
        const status = statusMap[error.code] ?? 400;
        res.status(status).json({ error: error.message });
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

    const parsed = bottleExchangeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const order = await orderService.recordBottleExchange(id, user.sub, {
        collectedQty: parsed.data.returned_empty_qty,
        returnedQty: parsed.data.returned_empty_qty,
        condition: parsed.data.bottle_condition,
      });
      res.json({ order });
    } catch (error) {
      if (error instanceof OrderServiceError) {
        const statusMap: Record<string, number> = {
          ORDER_NOT_FOUND: 404,
          FORBIDDEN: 403,
        };
        const status = statusMap[error.code] ?? 400;
        res.status(status).json({ error: error.message });
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

    const parsed = nonCollectionSchema.safeParse(req.body);
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
        const statusMap: Record<string, number> = {
          ORDER_NOT_FOUND: 404,
          FORBIDDEN: 403,
        };
        const status = statusMap[error.code] ?? 400;
        res.status(status).json({ error: error.message });
        return;
      }
      logger.error({ error }, "Error recording empty not collected");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
