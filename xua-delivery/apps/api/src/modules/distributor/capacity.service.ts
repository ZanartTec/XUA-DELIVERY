import type { Prisma, DeliveryWindow } from "@prisma/client";
import { logger } from "../../infra/logger/index.js";

type TxClient = Prisma.TransactionClient;

/**
 * CapacityService — Stub para PR 08 (Serviços Distribuidor).
 * Por agora: não lança erro, permite criar pedidos em dev.
 * Em produção, precisa do PR 08 para validar slots disponíveis.
 */
export const capacityService = {
  /**
   * Reserva slot de entrega.
   * @throws Error se não houver slots disponíveis (implementado no PR 08).
   */
  async reserve(
    _zoneId: string,
    _deliveryDate: string,
    _deliveryWindow: DeliveryWindow,
    _tx: TxClient
  ): Promise<void> {
    // Stub: loga mas não valida (permite criar pedidos em dev)
    logger.warn(
      { _zoneId, _deliveryDate, _deliveryWindow },
      "[STUB] capacityService.reserve() — implementação completa no PR 08"
    );
    // Em produção, esta função deve:
    // 1. Buscar slot com FOR UPDATE
    // 2. Verificar slots_available > 0
    // 3. Decrementar slots_available
    // 4. Lançar erro se não houver slots
  },

  /**
   * Libera slot de entrega.
   * Chamado quando pedido é cancelado.
   */
  async release(
    _zoneId: string,
    _deliveryDate: string,
    _deliveryWindow: DeliveryWindow,
    _tx: TxClient
  ): Promise<void> {
    logger.warn(
      { _zoneId, _deliveryDate, _deliveryWindow },
      "[STUB] capacityService.release() — implementação completa no PR 08"
    );
  },
};
