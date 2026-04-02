import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { ordersController } from "./orders.controller.js";

const router = Router();

// Todas as rotas de pedidos requerem autenticação
router.use(authMiddleware);

/**
 * GET /api/orders
 * Lista pedidos com base no scope e role do usuário.
 * - consumer: lista próprios pedidos
 * - distributor_admin: scope=distributor lista pedidos do distribuidor
 * - ops/support: scope=support busca por telefone/email/id
 */
router.get("/", ordersController.list);

/**
 * POST /api/orders
 * Cria novo pedido.
 * Apenas consumers podem criar pedidos.
 */
router.post("/", requireRole("consumer"), ordersController.create);

/**
 * GET /api/orders/:id
 * Busca detalhes de um pedido com timeline.
 * Acesso baseado em ownership (SEC-05).
 */
router.get("/:id", ordersController.getById);

/**
 * PATCH /api/orders/:id
 * Ações de mudança de estado:
 * - accept: distribuidor aceita pedido
 * - reject: distribuidor rejeita pedido
 * - complete_checklist: distribuidor completa checklist
 * - dispatch: distribuidor despacha pedido (requer driver_id)
 * - deliver: motorista entrega pedido
 * - verify_otp: motorista valida OTP e entrega
 * - otp_override: ops/support faz override do OTP
 * - cancel: cancela pedido
 * - delivery_failed: motorista marca falha na entrega
 * - schedule_redelivery: ops agenda reentrega
 */
router.patch("/:id", ordersController.action);

/**
 * POST /api/orders/:id/rating
 * Consumer submete avaliação NPS após entrega.
 */
router.post("/:id/rating", requireRole("consumer"), ordersController.submitRating);

/**
 * POST /api/orders/:id/bottle-exchange
 * Motorista registra troca de vasilhame.
 */
router.post("/:id/bottle-exchange", requireRole("driver", "operator"), ordersController.recordBottleExchange);

/**
 * POST /api/orders/:id/empty-not-collected
 * Motorista registra vasilhame não coletado.
 */
router.post("/:id/empty-not-collected", requireRole("driver", "operator"), ordersController.recordEmptyNotCollected);

export { router as ordersRoutes };
