import type { Prisma } from "@prisma/client";
import { logger } from "../../infra/logger/index.js";

type TxClient = Prisma.TransactionClient;

/**
 * DepositService — Stub para PR 07 (Serviços Consumer).
 * Funcionalidade de cauções/depósitos para primeira compra.
 */
export const depositService = {
  /**
   * Retorna valor padrão de depósito em centavos.
   * No monólito: R$ 30,00 = 3000 centavos.
   */
  getDepositAmountCents(): number {
    return 3000; // R$ 30,00
  },

  /**
   * Retorna preview do depósito para UI.
   */
  getPreview(): { amountCents: number; description: string } {
    return {
      amountCents: 3000,
      description: "Caução do vasilhame (devolvida ao término)",
    };
  },

  /**
   * Registra hold de depósito na primeira compra.
   * @param consumerId ID do consumidor
   * @param orderId ID do pedido
   * @param amountCents Valor em centavos
   * @param tx Transaction client
   * @param options Opções adicionais
   */
  async holdDeposit(
    _consumerId: string,
    _orderId: string,
    _amountCents: number,
    _tx: TxClient,
    _options?: { isFirstPurchase?: boolean }
  ): Promise<void> {
    logger.warn(
      { _consumerId, _orderId, _amountCents },
      "[STUB] depositService.holdDeposit() — implementação completa no PR 07"
    );
    // Em produção, deve criar registro na tabela 15_fin_deposits
  },

  /**
   * Libera depósito quando consumidor devolve todos os vasilhames.
   */
  async releaseDeposit(
    _consumerId: string,
    _orderId: string,
    _tx: TxClient
  ): Promise<void> {
    logger.warn(
      { _consumerId, _orderId },
      "[STUB] depositService.releaseDeposit() — implementação completa no PR 07"
    );
  },
};
