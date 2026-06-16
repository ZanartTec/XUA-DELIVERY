import type { Prisma, DistributorPaymentSettings } from "@prisma/client";
import { getPrisma } from "../../infra/prisma/client.js";

/**
 * Acesso à tabela 34_cfg_distributor_payment_settings (config de pagamento por
 * distribuidora). Guarda os campos cifrados como vieram — cifrar/decifrar é
 * responsabilidade do service.
 */
export const distributorGatewayRepository = {
  findByDistributorId(distributorId: string): Promise<DistributorPaymentSettings | null> {
    return getPrisma().distributorPaymentSettings.findUnique({
      where: { distributor_id: distributorId },
    });
  },

  /** Subconjunto de distributor_ids que têm gateway MP configurado (token + secret). */
  async findConfiguredDistributorIds(distributorIds: string[]): Promise<Set<string>> {
    if (distributorIds.length === 0) return new Set();
    const rows = await getPrisma().distributorPaymentSettings.findMany({
      where: {
        distributor_id: { in: distributorIds },
        mp_access_token_enc: { not: null },
        mp_webhook_secret_enc: { not: null },
      },
      select: { distributor_id: true },
    });
    return new Set(rows.map((row) => row.distributor_id));
  },

  upsert(
    distributorId: string,
    data: Prisma.DistributorPaymentSettingsUncheckedCreateInput
  ): Promise<DistributorPaymentSettings> {
    const { distributor_id: _ignored, ...rest } = data;
    return getPrisma().distributorPaymentSettings.upsert({
      where: { distributor_id: distributorId },
      create: { ...rest, distributor_id: distributorId },
      update: rest,
    });
  },
};
