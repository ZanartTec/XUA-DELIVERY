import type { NextFunction, Request, Response } from "express";
import type { Order } from "@prisma/client";
import { OrderStatus } from "@xua/shared/enums";
import { orderService } from "../services/orders.service.js";
import { driverDeliveryActor, opsDeliveryActor } from "../services/delivery-actor.js";
import { orderEventsPublisher } from "../services/order-events.publisher.js";
import type { BottleStep } from "../services/order-bottle.service.js";
import type { BottleStepInput } from "@xua/shared/schemas/order";
import { orderPolicy } from "../policies/order.policy.js";
import { orderRepository } from "../repository/orders.repository.js";
import { otpService } from "../../driver/services/otp.service.js";
import { getIO } from "../../../infra/socket/gateway.js";
import {
  createOrderSchema,
  ratingSchema,
  bottleExchangeSchema,
  nonCollectionSchema,
  rejectOrderSchema,
  assignDriverSchema,
  dispatchSchema,
  dispatchWithChecklistSchema,
  completeDeliverySchema,
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

/**
 * Traduz o passo de vasilhame do contrato HTTP para o tipo do serviço.
 * `collected_empty_qty` ausente assume o valor de `returned_empty_qty`.
 */
function toBottleStep(input: BottleStepInput): BottleStep {
  if (input.kind === "exchange") {
    return {
      kind: "exchange",
      collectedQty: input.collected_empty_qty ?? input.returned_empty_qty,
      returnedQty: input.returned_empty_qty,
      condition: input.bottle_condition,
    };
  }
  return { kind: "not_collected", reason: input.reason, notes: input.notes };
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
    try {
      const parsed = createOrderSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const order = await orderService.createOrderFromCheckout(req.user!.sub, parsed.data);
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
   * PATCH /api/orders/:id/verify-otp
   * Conclusão da entrega: código do cliente + vasilhame, numa requisição só.
   *
   * A validação do código roda em transação própria, de propósito: a tentativa
   * precisa ser contabilizada mesmo quando o código está errado, senão a trava
   * de 5 tentativas nunca fecharia. Só depois de o código conferir é que o
   * vasilhame e a mudança de status acontecem — juntos, na mesma transação.
   */
  async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await loadOwnedOrder(req);

      const parsed = completeDeliverySchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const validation = await otpService.validate(existing.id, parsed.data.code, req.user!.sub);
      if (!validation.isValid) {
        // Só na transição para bloqueado. Reemitir a cada tentativa contra um
        // OTP já bloqueado viraria ruído numa sala que recebe o tráfego de
        // todas as distribuidoras — e o desbloqueio é ação de ops.
        if (validation.locked) {
          orderEventsPublisher.notifyOps("otp_locked", {
            orderId: existing.id,
            distributorId: existing.distributor_id,
            driverId: req.user!.sub,
            attempts: validation.attempts,
          });
        }
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

      const updatedOrder = await orderService.deliverOrder(
        existing.id,
        driverDeliveryActor(req.user!.sub),
        toBottleStep(parsed.data.bottle_step)
      );
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
      // Ator real do override. Antes a conclusão era gravada como se o
      // motorista tivesse validado o código, com o id do usuário de ops no
      // campo do motorista — a trilha apontava para a pessoa errada.
      const updatedOrder = await orderService.deliverOrder(
        existing.id,
        opsDeliveryActor(req.user!.sub, req.user!.role)
      );
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

    try {
      // Ownership no controller, como nas demais ações de pedido. O service
      // mantém a própria checagem como defesa em profundidade, mas checar aqui
      // uniformiza o padrão e evita 500 mascarando 403/404.
      const existing = await loadOwnedOrder(req);

      const parsed = bottleExchangeSchema.safeParse({ ...req.body, driver_id: user.sub });
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const order = await orderService.recordBottleExchange(existing.id, user.sub, {
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

    try {
      const existing = await loadOwnedOrder(req);

      const parsed = nonCollectionSchema.safeParse({ ...req.body, driver_id: user.sub });
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const order = await orderService.recordEmptyNotCollected(existing.id, user.sub, {
        reason: parsed.data.reason,
        notes: parsed.data.notes,
      });
      res.json({ order });
    } catch (error) {
      next(error);
    }
  },
};
