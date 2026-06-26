import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { rateLimitMiddleware } from "../../../middleware/rate-limit.js";
import { RATE_LIMITS } from "../../../infra/rate-limit/limiter.js";
import { ordersController } from "../controllers/orders.controller.js";

const router = Router();

// Todas as rotas de pedidos requerem autenticação
router.use(authMiddleware);

const rateLimitByUser = (scope: string, config: (typeof RATE_LIMITS)[keyof typeof RATE_LIMITS]) =>
  rateLimitMiddleware(scope, config, (req) => req.user?.sub ?? req.ip);

const ordersReadLimit = rateLimitByUser("orders:read", RATE_LIMITS.orders);
const ordersActionLimit = rateLimitByUser("orders:action", RATE_LIMITS.orders);
const driverActionLimit = rateLimitByUser("orders:driver-action", RATE_LIMITS.orderDriverAction);

/**
 * GET /api/orders
 * Lista pedidos com base no scope e role do usuário.
 * - consumer: lista próprios pedidos
 * - distributor_admin: scope=distributor lista pedidos do distribuidor
 * - ops/support: scope=support busca por telefone/email/id
 */
router.get(
  "/",
  requireRole("consumer", "distributor_admin", "driver", "ops", "support"),
  ordersReadLimit,
  ordersController.list
);

/**
 * POST /api/orders
 * Cria novo pedido.
 * Apenas consumers podem criar pedidos.
 */
router.post(
  "/",
  requireRole("consumer"),
  rateLimitByUser("orders:create", RATE_LIMITS.orderCreate),
  ordersController.create
);

/**
 * GET /api/orders/:id
 * Busca detalhes de um pedido com timeline.
 * Acesso baseado em ownership (SEC-05).
 */
router.get(
  "/:id",
  requireRole("consumer", "distributor_admin", "driver", "ops", "support"),
  ordersReadLimit,
  ordersController.getById
);

/**
 * PATCH /api/orders/:id/accept
 * Distribuidor aceita o pedido.
 */
router.patch("/:id/accept", requireRole("distributor_admin"), ordersActionLimit, ordersController.accept);

/**
 * PATCH /api/orders/:id/reject
 * Distribuidor rejeita o pedido.
 */
router.patch("/:id/reject", requireRole("distributor_admin"), ordersActionLimit, ordersController.reject);

/**
 * PATCH /api/orders/:id/assign-driver
 * Distribuidor atribui (ou reatribui) motorista ao pedido.
 */
router.patch(
  "/:id/assign-driver",
  requireRole("distributor_admin"),
  ordersActionLimit,
  ordersController.assignDriver
);

/**
 * PATCH /api/orders/:id/complete-checklist
 * Distribuidor completa o checklist de despacho.
 */
router.patch(
  "/:id/complete-checklist",
  requireRole("distributor_admin"),
  ordersActionLimit,
  ordersController.completeChecklist
);

/**
 * PATCH /api/orders/:id/dispatch
 * Distribuidor despacha o pedido (gera OTP).
 */
router.patch("/:id/dispatch", requireRole("distributor_admin"), ordersActionLimit, ordersController.dispatch);

/**
 * PATCH /api/orders/:id/dispatch-with-checklist
 * Checklist + dispatch numa única chamada (gera OTP).
 */
router.patch(
  "/:id/dispatch-with-checklist",
  requireRole("distributor_admin"),
  ordersActionLimit,
  ordersController.dispatchWithChecklist
);

/**
 * PATCH /api/orders/:id/deliver
 * Motorista confirma entrega (uso administrativo/teste, sem validar OTP).
 */
router.patch("/:id/deliver", requireRole("driver"), driverActionLimit, ordersController.deliver);

/**
 * PATCH /api/orders/:id/verify-otp
 * Motorista valida o código informado pelo cliente e confirma a entrega.
 */
router.patch("/:id/verify-otp", requireRole("driver"), driverActionLimit, ordersController.verifyOtp);

/**
 * PATCH /api/orders/:id/otp-override
 * Ops/support faz bypass do OTP (sempre com motivo obrigatório).
 */
router.patch(
  "/:id/otp-override",
  requireRole("ops", "support"),
  ordersActionLimit,
  ordersController.otpOverride
);

/**
 * PATCH /api/orders/:id/cancel
 * Cancela o pedido (consumer, distributor_admin, driver ou ops).
 */
router.patch(
  "/:id/cancel",
  requireRole("consumer", "distributor_admin", "driver", "ops"),
  ordersActionLimit,
  ordersController.cancel
);

/**
 * PATCH /api/orders/:id/delivery-failed
 * Motorista registra falha na entrega.
 */
router.patch(
  "/:id/delivery-failed",
  requireRole("driver"),
  driverActionLimit,
  ordersController.deliveryFailed
);

/**
 * PATCH /api/orders/:id/schedule-redelivery
 * Ops/support agenda uma reentrega.
 */
router.patch(
  "/:id/schedule-redelivery",
  requireRole("ops", "support"),
  ordersActionLimit,
  ordersController.scheduleRedelivery
);

/**
 * POST /api/orders/:id/rating
 * Consumer submete avaliação NPS após entrega.
 */
router.post(
  "/:id/rating",
  requireRole("consumer"),
  rateLimitByUser("orders:rating", RATE_LIMITS.orderRating),
  ordersController.submitRating
);

/**
 * POST /api/orders/:id/bottle-exchange
 * Motorista registra troca de vasilhame.
 */
router.post(
  "/:id/bottle-exchange",
  requireRole("driver"),
  driverActionLimit,
  ordersController.recordBottleExchange
);

/**
 * POST /api/orders/:id/empty-not-collected
 * Motorista registra vasilhame não coletado.
 */
router.post(
  "/:id/empty-not-collected",
  requireRole("driver"),
  driverActionLimit,
  ordersController.recordEmptyNotCollected
);

export { router as ordersRoutes };
