import { distributorRepository } from "../../distributor/repository/distributor.repository.js";

/**
 * OrderPolicy — regras de autorização sobre pedidos.
 * Extraído do controller para manter a separação de responsabilidades.
 */
export const orderPolicy = {
  async canAccess(
    order: { consumer_id: string; distributor_id: string; driver_id: string | null },
    userId: string,
    role: string
  ): Promise<boolean> {
    if (role === "ops" || role === "support") return true;
    if (role === "consumer" && order.consumer_id === userId) return true;
    if (role === "distributor_admin") {
      const distId = await distributorRepository.resolveDistributorId(userId);
      return distId !== null && order.distributor_id === distId;
    }
    if (role === "driver" && order.driver_id === userId) return true;
    return false;
  },
};
