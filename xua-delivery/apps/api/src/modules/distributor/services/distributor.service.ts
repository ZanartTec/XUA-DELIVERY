import { getPrisma } from "../../../infra/prisma/client.js";
import { distributorRepository } from "../repository/distributor.repository.js";
import { createLogger } from "../../../infra/logger/index.js";

const log = createLogger("distributor-service");

export const distributorService = {
  /**
   * Resolve a distribuidora final para um pedido.
   * - Se distributorId fornecido: valida contra a zona/capacidade → modo manual.
   * - Senão: usa zone.distributor_id (lógica automática atual).
   */
  async resolveDistributor(
    consumerId: string,
    zoneId: string,
    deliveryDate: string,
    window: string,
    distributorId?: string,
  ): Promise<{ distributorId: string; zoneId: string; mode: "manual" | "auto" }> {
    const prisma = getPrisma();

    if (distributorId) {
      // Validação: distributor deve atender a mesma área geográfica da zona
      const result = await distributorRepository.validateDistributorForZone(
        distributorId,
        zoneId,
        deliveryDate,
        window,
      );

      if (!result.valid || !result.resolvedZoneId) {
        throw new DistributorServiceError(
          "DISTRIBUTOR_NOT_AVAILABLE",
          "Distribuidora selecionada não atende esta zona/data/janela",
        );
      }

      log.info(
        { consumerId, distributorId, zoneId, mode: "manual" },
        "Distributor resolved manually",
      );

      return {
        distributorId,
        zoneId: result.resolvedZoneId,
        mode: "manual",
      };
    }

    // Fallback automático: usa distributor_id da zona do endereço
    const zone = await prisma.zone.findUnique({
      where: { id: zoneId },
      select: { distributor_id: true },
    });

    if (!zone) {
      throw new DistributorServiceError("ZONE_NOT_FOUND", "Zona não encontrada");
    }

    log.info(
      { consumerId, distributorId: zone.distributor_id, zoneId, mode: "auto" },
      "Distributor resolved automatically",
    );

    return {
      distributorId: zone.distributor_id,
      zoneId,
      mode: "auto",
    };
  },
};

export class DistributorServiceError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "DistributorServiceError";
  }
}
