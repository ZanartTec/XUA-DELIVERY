import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { consumersController } from "../controllers/consumers.controller.js";
import { depositController } from "../../deposits/index.js";

const router = Router();

// Todas as rotas de consumer exigem autenticação
router.use(authMiddleware);
router.use(requireRole("consumer"));

// CEP lookup (antes das rotas :id para não conflitar)
router.get("/cep/:cep", consumersController.lookupCep);

// Profile
router.get("/:id", consumersController.getProfile);
router.patch("/:id", consumersController.updateProfile);

// Assign mode (auto/manual distributor)
router.patch("/:id/assign-mode", consumersController.updateAssignMode);

// Caução de vasilhames: preview de settlement (checkout) + saldo do consumidor
router.post("/:id/deposit/preview", depositController.consumerPreview);
router.get("/:id/deposit/balance", depositController.consumerBalance);

// Addresses
router.get("/:id/addresses", consumersController.listAddresses);
router.post("/:id/addresses", consumersController.createAddress);

export { router as consumersRoutes };
