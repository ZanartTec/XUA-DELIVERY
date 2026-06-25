import {
  ActorType,
  AuditEventType,
  DepositMovementType,
  SourceApp,
} from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { auditRepository } from "../../audit/audit.repository.js";
import { createLogger } from "../../../infra/logger";
import { depositRepository, type TxClient } from "../repository/deposit.repository.js";

const log = createLogger("deposit-program");

export class DepositProgramError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "DepositProgramError";
  }
}

export const depositProgramService = {
  /** Busca consumidor por CPF/CNPJ (documento já normalizado). */
  async lookupByDocument(distributorId: string, document: string) {
    const consumer = await depositRepository.findConsumerByDocument(document);
    if (!consumer) {
      throw new DepositProgramError("CONSUMER_NOT_FOUND", "Consumidor não encontrado");
    }
    const program = await depositRepository.findProgram(distributorId, consumer.id);
    return {
      consumer,
      already_linked: program != null,
      is_enabled: program?.is_enabled ?? false,
      max_bottles: program?.max_bottles ?? 0,
    };
  },

  async listPrograms(distributorId: string) {
    return depositRepository.listProgramsByDistributor(distributorId);
  },

  /** Habilita (ou reabilita) consumidor no programa. Vínculo por id + snapshot do documento. */
  async enrollConsumer(params: {
    distributorId: string;
    consumerId: string;
    maxBottles: number;
    notes?: string | null;
    enabledByUserId: string;
  }) {
    const prisma = getPrisma();
    return prisma.$transaction(async (tx: TxClient) => {
      const consumer = await tx.consumer.findUnique({
        where: { id: params.consumerId },
        select: { id: true, document: true },
      });
      if (!consumer) {
        throw new DepositProgramError("CONSUMER_NOT_FOUND", "Consumidor não encontrado");
      }
      if (!consumer.document) {
        throw new DepositProgramError(
          "CONSUMER_NO_DOCUMENT",
          "Consumidor sem CPF/CNPJ cadastrado"
        );
      }

      const program = await depositRepository.upsertProgram(
        {
          distributorId: params.distributorId,
          consumerId: params.consumerId,
          documentSnapshot: consumer.document,
          maxBottles: params.maxBottles,
          notes: params.notes ?? null,
          enabledBy: params.enabledByUserId,
        },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.DEPOSIT_PROGRAM_ENABLED,
          actor: { type: ActorType.DISTRIBUTOR_USER, id: params.enabledByUserId },
          sourceApp: SourceApp.DISTRIBUTOR_WEB,
          payload: {
            distributor_id: params.distributorId,
            consumer_id: params.consumerId,
            max_bottles: params.maxBottles,
          },
        },
        tx
      );

      log.info(
        { distributorId: params.distributorId, consumerId: params.consumerId },
        "Deposit program enrolled"
      );
      return program;
    });
  },

  async updateProgram(params: {
    distributorId: string;
    consumerId: string;
    isEnabled?: boolean;
    maxBottles?: number;
    notes?: string | null;
    actorUserId: string;
  }) {
    const prisma = getPrisma();
    return prisma.$transaction(async (tx: TxClient) => {
      const existing = await depositRepository.findProgram(
        params.distributorId,
        params.consumerId,
        tx
      );
      if (!existing) {
        throw new DepositProgramError("PROGRAM_NOT_FOUND", "Vínculo não encontrado");
      }

      const updated = await depositRepository.patchProgram(
        params.distributorId,
        params.consumerId,
        {
          isEnabled: params.isEnabled,
          maxBottles: params.maxBottles,
          notes: params.notes,
          disabledBy: params.actorUserId,
        },
        tx
      );

      if (params.isEnabled === false) {
        await auditRepository.emit(
          {
            eventType: AuditEventType.DEPOSIT_PROGRAM_DISABLED,
            actor: { type: ActorType.DISTRIBUTOR_USER, id: params.actorUserId },
            sourceApp: SourceApp.DISTRIBUTOR_WEB,
            payload: { distributor_id: params.distributorId, consumer_id: params.consumerId },
          },
          tx
        );
      }

      return updated;
    });
  },

  async listBalancesByDistributor(distributorId: string) {
    return depositRepository.listBalancesByDistributor(distributorId);
  },

  async getConsumerBalance(consumerId: string) {
    const balances = await depositRepository.listBalancesByConsumer(consumerId);
    return {
      balances: balances.map((b) => ({
        distributor_id: b.distributor_id,
        distributor_name: b.distributor.name,
        inventory_item_id: b.inventory_item_id,
        item_code: b.inventory_item.code,
        item_name: b.inventory_item.name,
        bottles_on_loan: b.bottles_on_loan,
      })),
    };
  },

  /** Ajuste manual / baixa (WRITE_OFF) de saldo, pela distribuidora. */
  async adjustBalance(params: {
    distributorId: string;
    consumerId: string;
    inventoryItemId: string;
    bottlesDelta: number;
    movementType: "MANUAL_ADJUSTMENT" | "WRITE_OFF";
    notes: string;
    actorUserId: string;
  }) {
    const prisma = getPrisma();
    return prisma.$transaction(async (tx: TxClient) => {
      const balance = await depositRepository.findBalance(
        params.distributorId,
        params.consumerId,
        params.inventoryItemId,
        tx
      );
      const current = balance?.bottles_on_loan ?? 0;
      const next = current + params.bottlesDelta;
      if (next < 0) {
        throw new DepositProgramError(
          "BALANCE_NEGATIVE",
          "Ajuste resultaria em saldo negativo de vasilhames"
        );
      }

      const occurredAt = new Date();
      await depositRepository.applyBalanceDelta(
        params.distributorId,
        params.consumerId,
        params.inventoryItemId,
        params.bottlesDelta,
        occurredAt,
        tx
      );
      await depositRepository.createMovement(
        {
          distributorId: params.distributorId,
          consumerId: params.consumerId,
          inventoryItemId: params.inventoryItemId,
          bottlesDelta: params.bottlesDelta,
          movementType:
            params.movementType === "WRITE_OFF"
              ? DepositMovementType.WRITE_OFF
              : DepositMovementType.MANUAL_ADJUSTMENT,
          actorType: ActorType.DISTRIBUTOR_USER,
          actorId: params.actorUserId,
          sourceApp: SourceApp.DISTRIBUTOR_WEB,
          notes: params.notes,
          occurredAt,
        },
        tx
      );

      if (params.movementType === "WRITE_OFF") {
        await auditRepository.emit(
          {
            eventType: AuditEventType.DEPOSIT_BOTTLES_WRITTEN_OFF,
            actor: { type: ActorType.DISTRIBUTOR_USER, id: params.actorUserId },
            sourceApp: SourceApp.DISTRIBUTOR_WEB,
            payload: {
              distributor_id: params.distributorId,
              consumer_id: params.consumerId,
              bottles: params.bottlesDelta,
            },
          },
          tx
        );
      }

      return { previous: current, next };
    });
  },
};
