import { subscriptionPlansRepository } from "../repository/subscription-plans.repository.js";
import { createLogger } from "../../../infra/logger/index.js";

const log = createLogger("subscription-plans");

export const subscriptionPlansService = {
  async listPlans(activeOnly = false) {
    return subscriptionPlansRepository.findAll(activeOnly);
  },

  async getPlan(id: string) {
    const plan = await subscriptionPlansRepository.findById(id);
    if (!plan) throw new Error("PLAN_NOT_FOUND");
    return plan;
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

    const updated = await subscriptionPlansRepository.update(id, {
      ...data,
      valid_from: data.valid_from ? new Date(data.valid_from) : undefined,
      valid_until: data.valid_until ? new Date(data.valid_until) : undefined,
    });
    log.info({ planId: id }, "Subscription plan updated");
    return updated;
  },
};
