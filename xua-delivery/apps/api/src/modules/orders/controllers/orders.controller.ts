import type { NextFunction, Request, Response } from "express";
import type { Order, Product } from "@prisma/client";
import { OrderStatus, type DeliveryWindow } from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { orderService } from "../services/orders.service.js";
import { orderPolicy } from "../policies/order.policy.js";
import { orderRepository } from "../repository/orders.repository.js";
import { otpService } from "../../driver/services/otp.service.js";
import { getIO } from "../../../infra/socket/gateway.js";
import { distributorService } from "../../distributor/index.js";
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
import { AppError, badRequest, conflict, forbidden, notFound } from "../../../errors/index.js";

/** SEC-05: carrega o pedido e verifica ownership antes de qualquer ação. */
async function loadOwnedOrder(req: Request): Promise<Order> {
  const user = req.user!;
  const id = req.params.id as string;

  const existing = await orderRepository.findById(id);
  if (!existing) throw notFound("Pedido não encontrado");
  if (!(await orderPolicy.canAccess(existing, user.sub, user.role))) throw forbidden();
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
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = req.user!;
    const scope = req.query.scope as string | undefined;
    const statusParam = req.query.status as string | undefined;

    try {
      // SEC-08: Scope support — busca por nome/telefone/email/CPF/id, com filtro opcional de data e status
      if (scope === "support") {
        if (user.role !== "support" && user.role !== "ops") {
          throw forbidden();
        }
        // Sanitiza texto livre: tira wildcards do LIKE (%_\) que dariam scan largo/lento
        const sanitizeText = (value: unknown) =>
          typeof value === "string" ? value.replace(/[%_\\]/g, "").trim() : "";
        const onlyDigits = (value: unknown) => (typeof value === "string" ? value.replace(/\D/g, "") : "");

        const q = sanitizeText(req.query.q);
        const name = sanitizeText(req.query.name);
        const email = sanitizeText(req.query.email);
        const phone = sanitizeText(req.query.phone);
        const document = onlyDigits(req.query.document);
        const id = sanitizeText(req.query.id);
        const dateParam = req.query.date as string | undefined;
        const statusParamRaw = req.query.status as string | undefined;

        const textFields: [string, string][] = [
          ["q", q],
          ["name", name],
          ["email", email],
          ["phone", phone],
          ["document", document],
          ["id", id],
        ];
        for (const [, value] of textFields) {
          if (value && value.length < 3) {
            throw badRequest("Campo de busca deve ter ao menos 3 caracteres");
          }
        }

        const hasFilter = textFields.some(([, value]) => value.length >= 3) || !!dateParam;
        if (!hasFilter) {
          throw badRequest("Informe ao menos um campo de busca com 3+ caracteres ou uma data");
        }

        let date: Date | undefined;
        if (dateParam) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
            throw badRequest("Data inválida (YYYY-MM-DD)");
          }
          date = new Date(`${dateParam}T00:00:00.000Z`);
        }

        let status: OrderStatus | undefined;
        if (statusParamRaw) {
          if (!Object.values(OrderStatus).includes(statusParamRaw as OrderStatus)) {
            throw badRequest("Status inválido");
          }
          status = statusParamRaw as OrderStatus;
        }

        const orders = await orderService.searchOrders({
          q: q || undefined,
          name: name || undefined,
          email: email || undefined,
          phone: phone || undefined,
          document: document || undefined,
          id: id || undefined,
          date,
          status,
        });
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
          throw forbidden();
        }

        const parsed = distributorQueueQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          // code preservado: o painel do distribuidor diferencia query inválida
          // de erro de validação de corpo.
          throw new AppError("INVALID_QUERY", parsed.error.issues[0]?.message ?? "Query inválida", {
            status: 400,
          });
        }

        const result = await orderService.listDistributorQueue(user.sub, user.role, parsed.data);
        res.json(result);
        return;
      }

      const parsedQuery = consumerOrdersQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        throw new AppError("INVALID_QUERY", parsedQuery.error.issues[0]?.message ?? "Query inválida", {
          status: 400,
        });
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
      next(error);
    }
  },

  /**
   * POST /api/orders
   * Cria novo pedido.
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = req.user!;
    const prisma = getPrisma();

    try {
      const parsed = createOrderSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      // FUNC-03: Resolve zona e distribuidor pelo endereço
      const address = await prisma.address.findFirst({
        where: { id: parsed.data.address_id, consumer_id: user.sub },
      });
      if (!address) {
        throw notFound("Endereço não encontrado");
      }
      if (!address.zone_id) {
        throw badRequest("Endereço sem zona de entrega configurada");
      }

      const zone = await prisma.zone.findFirst({
        where: { id: address.zone_id, is_active: true },
      });
      if (!zone) {
        throw badRequest("Zona de entrega inativa");
      }

      // Busca preços reais dos produtos
      const productIds = parsed.data.items.map((i) => i.product_id);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds }, is_active: true },
      });
      if (products.length !== productIds.length) {
        throw badRequest("Um ou mais produtos inválidos ou inativos");
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
        deliveryInstructions: parsed.data.delivery_instructions ?? null,
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
      // Nenhum serviço lança estes dois hoje (resquício da agenda antiga);
      // mantidos como rede de segurança até se confirmar que não voltam.
      if (error instanceof Error && error.message === "SLOT_FULL") {
        next(conflict("Horário de entrega esgotado"));
        return;
      }
      if (error instanceof Error && error.message === "SLOT_NOT_FOUND") {
        next(notFound("Horário de entrega não disponível"));
        return;
      }
      next(error);
    }
  },

  /**
   * GET /api/orders/:id
   * Busca detalhes de um pedido com timeline.
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    try {
      const detail = await orderService.getOrderDetail(id, user.role);
      if (!detail) {
        throw notFound("Pedido não encontrado");
      }

      if (!(await orderPolicy.canAccess(detail, user.sub, user.role))) {
        throw forbidden();
      }

      res.json({ order: detail });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/orders/:id/accept
   * Distribuidor aceita o pedido.
   */
  async accept(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req);

      const updatedOrder = await orderService.acceptOrder(existing.id, req.user!.sub);
      res.json({ order: updatedOrder });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/orders/:id/reject
   * Distribuidor rejeita o pedido.
   */
  async reject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req);

      const parsed = rejectOrderSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const updatedOrder = await orderService.rejectOrder(
        existing.id,
        req.user!.sub,
        parsed.data.reason,
        parsed.data.details
      );
      res.json({ order: updatedOrder });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/orders/:id/assign-driver
   * Distribuidor atribui (ou reatribui) motorista ao pedido.
   */
  async assignDriver(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req);

      const parsed = assignDriverSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const updatedOrder = await orderService.assignDriver(existing.id, req.user!.sub, parsed.data.driver_id);
      res.json({ order: updatedOrder });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/orders/:id/complete-checklist
   * Distribuidor completa o checklist de despacho.
   */
  async completeChecklist(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req);

      const updatedOrder = await orderService.completeChecklist(existing.id, req.user!.sub);
      res.json({ order: updatedOrder });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/orders/:id/dispatch
   * Distribuidor despacha o pedido (gera OTP).
   */
  async dispatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req);

      const parsed = dispatchSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const result = await orderService.dispatch(existing.id, req.user!.sub, parsed.data.driver_id);
      // Envia OTP em tempo real ao consumer via Socket.IO
      getIO().to(`consumer:${result.order.consumer_id}`).emit("otp_generated", {
        orderId: existing.id,
        code: result.otpCode,
      });
      res.json({ order: result.order, otp: result.otpCode });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/orders/:id/dispatch-with-checklist
   * Checklist + dispatch numa única chamada (gera OTP).
   */
  async dispatchWithChecklist(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req);

      const parsed = dispatchWithChecklistSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const result = await orderService.dispatchWithChecklist(existing.id, req.user!.sub, parsed.data.driver_id);
      getIO().to(`consumer:${result.order.consumer_id}`).emit("otp_generated", {
        orderId: existing.id,
        code: result.otpCode,
      });
      res.json({ order: result.order, otp: result.otpCode });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/orders/:id/deliver
   * Motorista confirma entrega (sem validar OTP — uso administrativo/teste).
   */
  async deliver(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req);

      const updatedOrder = await orderService.deliverOrder(existing.id, req.user!.sub);
      res.json({ order: updatedOrder });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/orders/:id/verify-otp
   * Motorista valida o código informado pelo cliente e confirma a entrega.
   */
  async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req);

      const parsed = verifyOtpSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

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
      next(error);
    }
  },

  /**
   * PATCH /api/orders/:id/otp-override
   * Ops/support faz bypass do OTP (sempre com motivo obrigatório).
   */
  async otpOverride(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req);

      const parsed = otpOverrideSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      await otpService.override(existing.id, req.user!.sub, parsed.data.reason, parsed.data.details);
      const updatedOrder = await orderService.deliverOrder(existing.id, req.user!.sub);
      res.json({ order: updatedOrder });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/orders/:id/cancel
   * Cancela o pedido (consumer, distributor_admin, driver ou ops).
   */
  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req);

      const parsed = cancelOrderSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

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
      next(error);
    }
  },

  /**
   * PATCH /api/orders/:id/delivery-failed
   * Motorista registra falha na entrega.
   */
  async deliveryFailed(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req);

      const parsed = deliveryFailedSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const updatedOrder = await orderService.markDeliveryFailed(
        existing.id,
        req.user!.sub,
        parsed.data.reason,
        stockReturnOptions(parsed.data)
      );
      res.json({ order: updatedOrder });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/orders/:id/schedule-redelivery
   * Ops/support agenda uma reentrega.
   */
  async scheduleRedelivery(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req);

      const parsed = scheduleRedeliverySchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const updatedOrder = await orderService.scheduleRedelivery(
        existing.id,
        req.user!.sub,
        new Date(parsed.data.new_date)
      );
      res.json({ order: updatedOrder });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/orders/:id/rating
   * Submete avaliação NPS.
   */
  async submitRating(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    try {
      const parsed = ratingSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const order = await orderService.submitRating(id, user.sub, parsed.data.rating, parsed.data.comment);
      res.json({ order });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/orders/:id/bottle-exchange
   * Registra troca de vasilhame.
   */
  async recordBottleExchange(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    try {
      const parsed = bottleExchangeSchema.safeParse({ ...req.body, driver_id: user.sub });
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const order = await orderService.recordBottleExchange(id, user.sub, {
        // Vazios coletados do consumidor (settlement). Default = returned_empty_qty (compat).
        collectedQty: parsed.data.collected_empty_qty ?? parsed.data.returned_empty_qty,
        returnedQty: parsed.data.returned_empty_qty,
        condition: parsed.data.bottle_condition,
      });
      res.json({ order });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/orders/:id/empty-not-collected
   * Registra vasilhame não coletado.
   */
  async recordEmptyNotCollected(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    try {
      const parsed = nonCollectionSchema.safeParse({ ...req.body, driver_id: user.sub });
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const order = await orderService.recordEmptyNotCollected(id, user.sub, {
        reason: parsed.data.reason,
        notes: parsed.data.notes,
      });
      res.json({ order });
    } catch (error) {
      next(error);
    }
  },
};
