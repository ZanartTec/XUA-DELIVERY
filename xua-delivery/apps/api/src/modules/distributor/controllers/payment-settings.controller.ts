import type { NextFunction, Request, Response } from "express";
import { distributorPaymentSettingsUpdateSchema } from "@xua/shared/schemas/distributor-payment-settings";
import type { DistributorPaymentSettingsView } from "@xua/shared/schemas/distributor-payment-settings";
import { badRequest, forbidden } from "../../../errors/index.js";
import {
  distributorGatewayService,
  DEFAULT_PUBLIC_PAYMENT_METHODS,
} from "../../distributor-gateway/index.js";
import { PAYMENT_PROVIDERS } from "../../payments/gateway/payments.gateway.js";
import { distributorRepository } from "../repository/distributor.repository.js";

/** Defaults para distribuidora ainda sem configuração persistida. */
const DEFAULT_VIEW: DistributorPaymentSettingsView = {
  ...DEFAULT_PUBLIC_PAYMENT_METHODS,
  provider: PAYMENT_PROVIDERS.mercadoPago,
  mp_access_token_masked: null,
  mp_public_key: null,
};

/** distributor_admin só acessa a própria distribuidora; ops acessa qualquer. */
async function assertOwnership(req: Request, distributorId: string): Promise<void> {
  if (req.user!.role === "ops") return;
  const userDistId = await distributorRepository.resolveDistributorId(req.user!.sub);
  if (userDistId !== distributorId) {
    throw forbidden("Sem permissão para acessar esta distribuidora");
  }
}

export const paymentSettingsController = {
  /** GET /api/distributor/payment-settings/:distributorId — view mascarada. */
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    const distributorId = req.params.distributorId as string;
    try {
      if (!distributorId) throw badRequest("distributorId obrigatório");
      await assertOwnership(req, distributorId);

      const view = await distributorGatewayService.getAdminView(distributorId);
      res.json(view ?? DEFAULT_VIEW);
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /api/distributor/payment-settings/:distributorId */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    const distributorId = req.params.distributorId as string;
    try {
      const parsed = distributorPaymentSettingsUpdateSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);
      await assertOwnership(req, distributorId);

      res.json(await distributorGatewayService.updateSettings(distributorId, parsed.data));
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/distributors/:distributorId/payment-methods — capacidades públicas
   * (sem segredos) consumidas pelo checkout.
   */
  async getPublicMethods(req: Request, res: Response, next: NextFunction): Promise<void> {
    const distributorId = req.params.distributorId as string;
    try {
      if (!distributorId) throw badRequest("distributorId obrigatório");

      const methods = await distributorGatewayService.getPublicMethods(distributorId);
      res.json(methods ?? DEFAULT_PUBLIC_PAYMENT_METHODS);
    } catch (err) {
      next(err);
    }
  },
};
