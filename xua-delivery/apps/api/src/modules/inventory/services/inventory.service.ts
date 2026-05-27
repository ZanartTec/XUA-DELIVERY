import type { DistributorInventoryBalance, InventoryMovement, Prisma } from "@prisma/client";
import type {
  ActorType,
  InventoryMovementType,
  InventoryReferenceType,
  SourceApp,
} from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { createLogger } from "../../../infra/logger/index.js";
import {
  inventoryRepository,
  type TxClient,
} from "../repository/inventory.repository.js";

const logger = createLogger("inventory");

type ApplyMovementActor = {
  type: ActorType;
  id: string;
};

type ApplyMovementReference = {
  type: InventoryReferenceType;
  id: string;
};

export type ApplyInventoryMovementInput = {
  distributorId: string;
  inventoryItemId: string;
  quantityDelta: number;
  movementType: InventoryMovementType;
  actor: ApplyMovementActor;
  sourceApp: SourceApp;
  reference?: ApplyMovementReference | null;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
};

export type ApplyInventoryMovementResult = {
  movement: InventoryMovement;
  balance: DistributorInventoryBalance;
  idempotentReplay: boolean;
};

export class InventoryServiceError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "InventoryServiceError";
  }
}

function assertIntegerQuantity(quantityDelta: number): void {
  if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
    throw new InventoryServiceError(
      "INVALID_QUANTITY_DELTA",
      "quantityDelta deve ser um inteiro diferente de zero"
    );
  }
}

function assertReference(reference?: ApplyMovementReference | null): void {
  if (!reference) return;

  if (!reference.id.trim()) {
    throw new InventoryServiceError("INVALID_REFERENCE", "reference.id é obrigatório");
  }
}

function assertActor(actor: ApplyMovementActor): void {
  if (!actor.id.trim()) {
    throw new InventoryServiceError("INVALID_ACTOR", "actor.id é obrigatório");
  }
}

function normalizeJson(value: Prisma.InputJsonValue | Prisma.JsonValue | undefined): unknown {
  if (value == null) {
    return {};
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeJson(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, item]) => [key, normalizeJson(item as Prisma.InputJsonValue)])
    );
  }

  return value;
}

function stableJsonString(value: Prisma.InputJsonValue | Prisma.JsonValue | undefined): string {
  return JSON.stringify(normalizeJson(value));
}

function assertIdempotentReplayMatches(
  existingMovement: InventoryMovement,
  input: ApplyInventoryMovementInput
): void {
  const mismatches: string[] = [];

  if (existingMovement.quantity_delta !== input.quantityDelta) {
    mismatches.push("quantity_delta");
  }

  if (existingMovement.actor_type !== input.actor.type) {
    mismatches.push("actor_type");
  }

  if (existingMovement.actor_id !== input.actor.id) {
    mismatches.push("actor_id");
  }

  if (existingMovement.source_app !== input.sourceApp) {
    mismatches.push("source_app");
  }

  if (stableJsonString(existingMovement.metadata) !== stableJsonString(input.metadata)) {
    mismatches.push("metadata");
  }

  if (input.occurredAt && existingMovement.occurred_at.getTime() !== input.occurredAt.getTime()) {
    mismatches.push("occurred_at");
  }

  if (mismatches.length > 0) {
    logger.warn(
      {
        distributorId: input.distributorId,
        inventoryItemId: input.inventoryItemId,
        movementType: input.movementType,
        referenceType: input.reference?.type ?? null,
        referenceId: input.reference?.id ?? null,
        mismatches,
      },
      "Inventory movement idempotent replay rejected"
    );

    throw new InventoryServiceError(
      "IDEMPOTENCY_CONFLICT",
      `Movimento idempotente conflitante: ${mismatches.join(", ")}`
    );
  }
}

async function applyMovementInTx(
  input: ApplyInventoryMovementInput,
  tx: TxClient
): Promise<ApplyInventoryMovementResult> {
  assertIntegerQuantity(input.quantityDelta);
  assertReference(input.reference);
  assertActor(input.actor);

  const distributor = await inventoryRepository.findDistributor(input.distributorId, tx);
  const inventoryItem = await inventoryRepository.findInventoryItem(input.inventoryItemId, tx);

  if (!distributor) {
    throw new InventoryServiceError("DISTRIBUTOR_NOT_FOUND", "Distribuidora não encontrada");
  }

  if (!distributor.is_active) {
    throw new InventoryServiceError("DISTRIBUTOR_INACTIVE", "Distribuidora inativa");
  }

  if (!inventoryItem) {
    throw new InventoryServiceError("INVENTORY_ITEM_NOT_FOUND", "Item de estoque não encontrado");
  }

  if (!inventoryItem.is_active) {
    throw new InventoryServiceError("INVENTORY_ITEM_INACTIVE", "Item de estoque inativo");
  }

  const reference = input.reference ?? null;
  if (reference) {
    const existingMovement = await inventoryRepository.findMovementByReference(
      {
        distributorId: input.distributorId,
        inventoryItemId: input.inventoryItemId,
        movementType: input.movementType,
        referenceType: reference.type,
        referenceId: reference.id,
      },
      tx
    );

    if (existingMovement) {
      assertIdempotentReplayMatches(existingMovement, input);

      const balance = await inventoryRepository.findBalance(
        input.distributorId,
        input.inventoryItemId,
        tx
      );

      if (!balance) {
        throw new InventoryServiceError(
          "BALANCE_NOT_FOUND",
          "Saldo não encontrado para movimento já existente"
        );
      }

      logger.info(
        {
          distributorId: input.distributorId,
          inventoryItemId: input.inventoryItemId,
          movementType: input.movementType,
          referenceType: reference.type,
          referenceId: reference.id,
        },
        "Inventory movement idempotent replay"
      );

      return { movement: existingMovement, balance, idempotentReplay: true };
    }
  }

  let currentBalance = await inventoryRepository.findBalanceForUpdate(
    input.distributorId,
    input.inventoryItemId,
    tx
  );

  if (!currentBalance && input.quantityDelta < 0) {
    logger.warn(
      {
        distributorId: input.distributorId,
        inventoryItemId: input.inventoryItemId,
        quantityDelta: input.quantityDelta,
        movementType: input.movementType,
      },
      "Inventory movement rejected because balance does not exist"
    );
    throw new InventoryServiceError("STOCK_UNAVAILABLE", "Saldo insuficiente para movimentação");
  }

  const currentQuantity = currentBalance?.quantity_on_hand ?? 0;
  const nextQuantity = currentQuantity + input.quantityDelta;

  if (nextQuantity < 0) {
    logger.warn(
      {
        distributorId: input.distributorId,
        inventoryItemId: input.inventoryItemId,
        currentQuantity,
        quantityDelta: input.quantityDelta,
        nextQuantity,
        movementType: input.movementType,
      },
      "Inventory movement rejected because it would create negative stock"
    );
    throw new InventoryServiceError("STOCK_UNAVAILABLE", "Saldo insuficiente para movimentação");
  }

  const occurredAt = input.occurredAt ?? new Date();
  const movementData = {
    distributor_id: input.distributorId,
    inventory_item_id: input.inventoryItemId,
    quantity_delta: input.quantityDelta,
    movement_type: input.movementType,
    actor_type: input.actor.type,
    actor_id: input.actor.id,
    source_app: input.sourceApp,
    reference_type: reference?.type ?? null,
    reference_id: reference?.id ?? null,
    metadata: input.metadata,
    occurred_at: occurredAt,
  };

  const movement = reference
    ? await inventoryRepository.createMovementOnce(
        {
          ...movementData,
          reference_type: reference.type,
          reference_id: reference.id,
        },
        tx
      )
    : await inventoryRepository.createMovement(movementData, tx);

  if (!movement) {
    const existingMovement = await inventoryRepository.findMovementByReference(
      {
        distributorId: input.distributorId,
        inventoryItemId: input.inventoryItemId,
        movementType: input.movementType,
        referenceType: reference!.type,
        referenceId: reference!.id,
      },
      tx
    );

    const balance = await inventoryRepository.findBalance(
      input.distributorId,
      input.inventoryItemId,
      tx
    );

    if (!existingMovement || !balance) {
      throw new InventoryServiceError(
        "IDEMPOTENCY_CONFLICT",
        "Movimento idempotente conflitante não pôde ser recuperado"
      );
    }

    assertIdempotentReplayMatches(existingMovement, input);

    logger.info(
      {
        distributorId: input.distributorId,
        inventoryItemId: input.inventoryItemId,
        movementType: input.movementType,
        referenceType: reference!.type,
        referenceId: reference!.id,
      },
      "Inventory movement idempotent conflict resolved"
    );

    return { movement: existingMovement, balance, idempotentReplay: true };
  }

  const balance = await inventoryRepository.upsertBalance(
    input.distributorId,
    input.inventoryItemId,
    input.quantityDelta,
    occurredAt,
    tx
  );

  currentBalance = balance;

  logger.info(
    {
      distributorId: input.distributorId,
      inventoryItemId: input.inventoryItemId,
      movementType: input.movementType,
      quantityDelta: input.quantityDelta,
      quantityOnHand: currentBalance.quantity_on_hand,
      referenceType: reference?.type ?? null,
      referenceId: reference?.id ?? null,
    },
    "Inventory movement applied"
  );

  return { movement, balance, idempotentReplay: false };
}

export const inventoryService = {
  async applyMovement(
    input: ApplyInventoryMovementInput,
    tx?: TxClient
  ): Promise<ApplyInventoryMovementResult> {
    if (tx) {
      return applyMovementInTx(input, tx);
    }

    const prisma = getPrisma();
    return prisma.$transaction((transaction) => applyMovementInTx(input, transaction));
  },
};
