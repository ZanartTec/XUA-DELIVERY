import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { rateLimitMiddleware } from "../../../middleware/rate-limit.js";
import { RATE_LIMITS } from "../../../infra/rate-limit/limiter.js";
import { consumersController } from "../controllers/consumers.controller.js";
import { depositController } from "../../deposits/index.js";

const router = Router();

// Todas as rotas de consumer exigem autenticação
router.use(authMiddleware);
router.use(requireRole("consumer"));

const consumerRead = rateLimitMiddleware(
  "consumers:read",
  RATE_LIMITS.authenticatedRead,
  (req) => req.user?.sub ?? req.ip
);
const consumerWrite = rateLimitMiddleware(
  "consumers:write",
  RATE_LIMITS.authenticatedWrite,
  (req) => req.user?.sub ?? req.ip
);

// CEP lookup (antes das rotas :id para não conflitar) — chama serviço externo
// (ViaCEP ou equivalente), então usa a categoria de custo de terceiro, não a
// leitura padrão de banco.
router.get(
  "/cep/:cep",
  rateLimitMiddleware("consumers:cep-lookup", RATE_LIMITS.externalLookup, (req) => req.user?.sub ?? req.ip),
  consumersController.lookupCep
);

// Profile
router.get("/:id", consumerRead, consumersController.getProfile);
router.patch("/:id", consumerWrite, consumersController.updateProfile);

// Assign mode (auto/manual distributor)
router.patch("/:id/assign-mode", consumerWrite, consumersController.updateAssignMode);

// Caução de vasilhames: preview de settlement (checkout) + saldo do consumidor
router.post("/:id/deposit/preview", consumerWrite, depositController.consumerPreview);
router.get("/:id/deposit/balance", consumerRead, depositController.consumerBalance);

// Addresses
router.get("/:id/addresses", consumerRead, consumersController.listAddresses);
router.post("/:id/addresses", consumerWrite, consumersController.createAddress);

export { router as consumersRoutes };
