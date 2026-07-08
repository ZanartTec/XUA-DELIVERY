/**
 * Backfill: garante que todo produto ATIVO tenha exatamente 1 item de estoque
 * vendável ativo vinculado (invariante do aceite de pedido — sem o item, o
 * pedido falha com INVENTORY_ITEM_NOT_FOUND).
 *
 * Idempotente: reexecutar não cria duplicatas (delegado a
 * inventoryItemProvisioningService.provisionForProduct, uma transação por produto).
 *
 * Uso:
 *   npx tsx scripts/backfill-product-inventory-items.ts            # aplica
 *   npx tsx scripts/backfill-product-inventory-items.ts --dry-run  # só lista
 */

type CliArgs = Record<string, string | true>;
type CleanupFn = () => Promise<void>;

const cleanupFns: CleanupFn[] = [];

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function usage(): string {
  return [
    "Uso:",
    "  npx tsx scripts/backfill-product-inventory-items.ts [--dry-run]",
    "",
    "  --dry-run  Lista o que seria criado/reativado sem escrever no banco.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const dryRun = args["dry-run"] === true;

  const [prismaModule, provisioningModule, repositoryModule] = await Promise.all([
    import("../apps/api/src/infra/prisma/client.js"),
    import("../apps/api/src/modules/inventory/services/inventory-item-provisioning.service.js"),
    import("../apps/api/src/modules/inventory/repository/inventory.repository.js"),
  ]);
  cleanupFns.push(prismaModule.disconnectPrisma);

  const prisma = prismaModule.getPrisma();
  const { inventoryItemProvisioningService, buildInventoryItemCode } = provisioningModule;
  const { inventoryRepository } = repositoryModule;

  const products = await prisma.product.findMany({
    where: { is_active: true },
    select: { id: true, name: true, kind: true },
    orderBy: { name: "asc" },
  });

  const summary = { created: 0, reactivated: 0, alreadyOk: 0, skippedConflict: 0, failed: 0 };

  for (const product of products) {
    const existingItems = await inventoryRepository.findInventoryItemsByProductId(product.id);
    const activeItems = existingItems.filter((item) => item.is_active);

    if (activeItems.length === 1) {
      summary.alreadyOk += 1;
      continue;
    }

    if (activeItems.length > 1) {
      summary.skippedConflict += 1;
      console.warn(
        `[SKIP] conflito: produto ${product.id} (${product.name}) tem ${activeItems.length} itens ativos — resolver manualmente`
      );
      continue;
    }

    const mostRecentInactive = existingItems[0];

    if (dryRun) {
      if (mostRecentInactive) {
        summary.reactivated += 1;
        console.log(
          `[DRY-RUN] reativaria item ${mostRecentInactive.id} (${mostRecentInactive.code}) do produto ${product.id} (${product.name})`
        );
      } else {
        summary.created += 1;
        console.log(
          `[DRY-RUN] criaria item code=${buildInventoryItemCode(product.name, product.id)} para produto ${product.id} (${product.name})`
        );
      }
      continue;
    }

    // Uma transação por produto: erro em um não interrompe os demais.
    let result;
    try {
      result = await prisma.$transaction((tx) =>
        inventoryItemProvisioningService.provisionForProduct(product, tx)
      );
    } catch (error) {
      summary.failed += 1;
      console.error(
        `[FAILED] produto ${product.id} (${product.name}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      continue;
    }

    if (!result) {
      // Conflito surgido entre a leitura acima e a transação.
      summary.skippedConflict += 1;
      console.warn(`[SKIP] conflito: produto ${product.id} (${product.name})`);
      continue;
    }

    if (result.created) {
      summary.created += 1;
      console.log(
        `[CREATED] item ${result.item.id} code=${result.item.code} para produto ${product.id} (${product.name})`
      );
    } else {
      summary.reactivated += 1;
      console.log(
        `[REACTIVATED] item ${result.item.id} code=${result.item.code} do produto ${product.id} (${product.name})`
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: summary.failed === 0,
        dryRun,
        totalActiveProducts: products.length,
        ...summary,
      },
      null,
      2
    )
  );

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled(cleanupFns.map((cleanup) => cleanup()));
  });
