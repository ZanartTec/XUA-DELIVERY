import { describe, expect, it, vi } from "vitest";
import { reconciliationSessionRepository } from "./reconciliation-session.repository.js";
import type { TxClient } from "./inventory.repository.js";

const distributorId = "7e1d7b55-3f52-4d10-aac3-74387c236901";
const itemWithBalance = "7e1d7b55-3f52-4d10-aac3-74387c236902";
const itemWithoutBalance = "7e1d7b55-3f52-4d10-aac3-74387c236903";

describe("reconciliationSessionRepository.listSnapshotBalances", () => {
  it("captura todos os itens ativos e usa saldo zero quando nao ha saldo materializado", async () => {
    const tx = {
      inventoryItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: itemWithBalance,
            distributor_balances: [{ quantity_on_hand: 8 }],
          },
          {
            id: itemWithoutBalance,
            distributor_balances: [],
          },
        ]),
      },
    } as unknown as TxClient;

    const result = await reconciliationSessionRepository.listSnapshotBalances(distributorId, tx);

    expect(result).toEqual([
      { inventory_item_id: itemWithBalance, quantity_on_hand: 8 },
      { inventory_item_id: itemWithoutBalance, quantity_on_hand: 0 },
    ]);
    expect(tx.inventoryItem.findMany).toHaveBeenCalledWith({
      where: { is_active: true },
      select: {
        id: true,
        distributor_balances: {
          where: { distributor_id: distributorId },
          select: { quantity_on_hand: true },
          take: 1,
        },
      },
      orderBy: [{ code: "asc" }, { id: "asc" }],
    });
  });
});