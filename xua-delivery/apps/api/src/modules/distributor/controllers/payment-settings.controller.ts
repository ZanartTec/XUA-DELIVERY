import type { Request, Response } from "express";
import { distributorPaymentSettingsUpdateSchema } from "@xua/shared/schemas/distributor-payment-settings";
import type {
  DistributorPaymentMethodsPublic,
  DistributorPaymentSettingsView,
} from "@xua/shared/schemas/distributor-payment-settings";
import { createLogger } from "../../../infra/logger/index.js";
import {
  distributorGatewayService,
  DistributorGatewayError,
} from "../../distributor-gateway/index.js";
import { distributorRepository } from "../repository/distributor.repository.js";

const log = createLogger("distributor-payment-settings");

/** Defaults para distribuidora ainda sem configuração persistida. */
const DEFAULT_VIEW: DistributorPaymentSettingsView = {
  accepts_pix_online: false,
  accepts_credit_online: false,
  accepts_cash_on_delivery: true,
  accepts_card_on_delivery: false,
  mp_connected: false,
  provider: "mercadopago",
  mp_access_token_masked: null,
  mp_public_key: null,
};

const DEFAULT_PUBLIC: DistributorPaymentMethodsPublic = {
  accepts_pix_online: false,
  accepts_credit_online: false,
  accepts_cash_on_delivery: true,
  accepts_card_on_delivery: false,
  mp_connected: false,
};

/** distributor_admin só acessa a própria distribuidora; ops acessa qualquer. */
async function assertOwnership(req: Request, distributorId: string): Promise<boolean> {
  if (req.user!.role === "ops") return true;
  const userDistId = await distributorRepository.resolveDistributorId(req.user!.sub);
  return userDistId === distributorId;
}

export const paymentSettingsController = {
  /** GET /api/distributor/payment-settings/:distributorId — view mascarada. */
  async get(req: Request, res: Response): Promise<void> {
    const distributorId = req.params.distributorId as string;
    if (!distributorId) {
      res.status(400).json({ error: "distributorId obrigatório" });
      return;
    }
    if (!(await assertOwnership(req, distributorId))) {
      res.status(403).json({ error: "Sem permissão para acessar esta distribuidora" });
      return;
    }

    try {
      const view = await distributorGatewayService.getAdminView(distributorId);
      res.json(view ?? DEFAULT_VIEW);
    } catch (err) {
      log.error({ err, distributorId }, "Erro ao buscar config de pagamento");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** PATCH /api/distributor/payment-settings/:distributorId */
  async update(req: Request, res: Response): Promise<void> {
    const distributorId = req.params.distributorId as string;
    const parsed = distributorPaymentSettingsUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    if (!(await assertOwnership(req, distributorId))) {
      res.status(403).json({ error: "Sem permissão para acessar esta distribuidora" });
      return;
    }

    try {
      const view = await distributorGatewayService.updateSettings(distributorId, parsed.data);
      res.json(view);
    } catch (err) {
      if (err instanceof DistributorGatewayError) {
        res.status(err.code === "GATEWAY_REQUIRED" ? 400 : 500).json({
          error: err.message,
          code: err.code,
        });
        return;
      }
      log.error({ err, distributorId }, "Erro ao salvar config de pagamento");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /**
   * GET /api/distributors/:distributorId/payment-methods — capacidades públicas
   * (sem segredos) consumidas pelo checkout.
   */
  async getPublicMethods(req: Request, res: Response): Promise<void> {
    const distributorId = req.params.distributorId as string;
    if (!distributorId) {
      res.status(400).json({ error: "distributorId obrigatório" });
      return;
    }

    try {
      const methods = await distributorGatewayService.getPublicMethods(distributorId);
      res.json(methods ?? DEFAULT_PUBLIC);
    } catch (err) {
      log.error({ err, distributorId }, "Erro ao buscar métodos de pagamento");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
