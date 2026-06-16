import { subscriptionPlansRepository } from "../repository/subscription-plans.repository.js";
import { createLogger } from "../../../infra/logger/index.js";
import { distributorGatewayService } from "../../distributor-gateway/index.js";

const log = createLogger("subscription-plans");

type RawPlanDistributor = {
  distributor: {
    id: string;
    name: string;
    payment_settings: { mp_access_token_enc: string | null; mp_webhook_secret_enc: string | null } | null;
  };
};
type RawPlan = { distributors: RawPlanDistributor[] } & Record<string, unknown>;

/**
 * Substitui os campos cifrados por um booleano `mp_connected` em cada
 * distribuidora do plano — nunca expõe o token (mesmo cifrado) na resposta.
 */
function withDistributorGatewayFlag<T extends RawPlan>(plan: T) {
  return {
    ...plan,
    distributors: plan.distributors.map((link) => {
      const { payment_settings, ...distributor } = link.distributor;
      return {
        ...link,
        distributor: {
          ...distributor,
          mp_connected: Boolean(
            payment_settings?.mp_access_token_enc && payment_settings?.mp_webhook_secret_enc,
          ),
        },
      };
    }),
  };
}

/**
 * Regra (P2): assinatura é paga online, então só distribuidoras COM gateway MP
 * configurado podem ser vinculadas a um plano. Bloqueia o vínculo caso falte.
 */
async function assertDistributorsHaveGateway(distributorIds: string[] | undefined): Promise<void> {
  if (!distributorIds || distributorIds.length === 0) return;
  const missing = await distributorGatewayService.findMissingGatewayIds(distributorIds);
  if (missing.length > 0) {
    throw new Error("DISTRIBUTOR_GATEWAY_REQUIRED");
  }
}

export const subscriptionPlansService = {
  async listPlans(activeOnly = false) {
    const plans = await subscriptionPlansRepository.findAll(activeOnly);
    return plans.map((plan) => withDistributorGatewayFlag(plan as unknown as RawPlan));
  },

  async getPlan(id: string) {
    const plan = await subscriptionPlansRepository.findById(id);
    if (!plan) throw new Error("PLAN_NOT_FOUND");
    return withDistributorGatewayFlag(plan as unknown as RawPlan);
  },

  async createPlan(data: {
    name: string;
    description?: string;
    product_id: string;
    quantity: number;
    discount_percentage?: number;
    unit_price_with_discount_cents: number;
    valid_from: string;
    valid_until: string;
    distributor_ids: string[];
  }) {
    await assertDistributorsHaveGateway(data.distributor_ids);
    const plan = await subscriptionPlansRepository.create({
      name: data.name,
      description: data.description,
      product: { connect: { id: data.product_id } },
      quantity: data.quantity,
      discount_percentage: data.discount_percentage ?? 0,
      unit_price_with_discount_cents: data.unit_price_with_discount_cents,
      valid_from: new Date(data.valid_from),
      valid_until: new Date(data.valid_until),
      is_active: true,
      distributor_ids: data.distributor_ids,
    });
    log.info({ planId: plan.id }, "Subscription plan created");
    return plan;
  },

  async updatePlan(
    id: string,
    data: {
      name?: string;
      description?: string;
      quantity?: number;
      discount_percentage?: number;
      unit_price_with_discount_cents?: number;
      valid_from?: string;
      valid_until?: string;
      is_active?: boolean;
      distributor_ids?: string[];
    }
  ) {
    const existing = await subscriptionPlansRepository.findById(id);
    if (!existing) throw new Error("PLAN_NOT_FOUND");

    await assertDistributorsHaveGateway(data.distributor_ids);

    const updated = await subscriptionPlansRepository.update(id, {
      ...data,
      valid_from: data.valid_from ? new Date(data.valid_from) : undefined,
      valid_until: data.valid_until ? new Date(data.valid_until) : undefined,
    });
    log.info({ planId: id }, "Subscription plan updated");
    return updated;
  },
};
