import type { Prisma } from "@prisma/client";
import { PaymentKind } from "../packages/shared/src/enums/index";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function argString(args: CliArgs, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizePaymentKind(value: string | undefined): PaymentKind | undefined {
  if (!value) return undefined;
  const normalized = value.toUpperCase();
  if (normalized === PaymentKind.ORDER) return PaymentKind.ORDER;
  if (normalized === PaymentKind.SUBSCRIPTION) return PaymentKind.SUBSCRIPTION;
  throw new Error("--payment-kind deve ser ORDER ou SUBSCRIPTION");
}

function usage(): string {
  return [
    "Uso:",
    "  npm run payments:webhook:reprocess -- --event-id <uuid>",
    "  npm run payments:webhook:reprocess -- --event-id <uuid> --reference-id <order-or-subscription-uuid> --payment-kind ORDER",
    "  npm run payments:webhook:reprocess -- --event-id <uuid> --force",
    "",
    "Observacao: use --reference-id/--payment-kind apenas apos confirmar manualmente o mapeamento no DB/Mercado Pago.",
  ].join("\n");
}

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function contextObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const force = args.force === true;
  const eventId = argString(args, "event-id");
  const referenceId = argString(args, "reference-id");
  const paymentKind = normalizePaymentKind(argString(args, "payment-kind"));

  if (!eventId) {
    throw new Error(usage());
  }
  if (!UUID_PATTERN.test(eventId)) {
    throw new Error("--event-id deve ser um UUID valido");
  }
  if (referenceId && !UUID_PATTERN.test(referenceId)) {
    throw new Error("--reference-id deve ser um UUID valido");
  }
  if (Boolean(referenceId) !== Boolean(paymentKind)) {
    throw new Error("--reference-id e --payment-kind devem ser usados juntos");
  }

  const [prismaModule, queueModule, producerModule, contractsModule] = await Promise.all([
    import("../apps/api/src/infra/prisma/client.js"),
    import("../apps/api/src/infra/queue/queues.js"),
    import("../apps/api/src/infra/queue/payment-jobs.producer.js"),
    import("../apps/api/src/infra/queue/contracts.js"),
  ]);
  cleanupFns.push(queueModule.closeQueueInfra, prismaModule.disconnectPrisma);

  const prisma = prismaModule.getPrisma();
  const event = await prisma.paymentWebhookEvent.findUnique({ where: { id: eventId } });
  if (!event) {
    throw new Error(`PaymentWebhookEvent nao encontrado: ${eventId}`);
  }
  if (event.processed_at && !force) {
    throw new Error("Evento ja processado. Use --force apenas se tiver certeza de que precisa reprocessar.");
  }

  if (referenceId && paymentKind === PaymentKind.ORDER) {
    const order = await prisma.order.findUnique({ where: { id: referenceId }, select: { id: true } });
    if (!order) throw new Error(`Order nao encontrada: ${referenceId}`);
  }

  if (referenceId && paymentKind === PaymentKind.SUBSCRIPTION) {
    const subscription = await prisma.userSubscription.findUnique({
      where: { id: referenceId },
      select: { id: true },
    });
    if (!subscription) throw new Error(`UserSubscription nao encontrada: ${referenceId}`);
  }

  const payload = jsonObject(event.payload);
  const nextPayload = { ...payload };

  if (referenceId && paymentKind) {
    nextPayload.xua_context = {
      ...contextObject(payload.xua_context),
      reference_id: referenceId,
      payment_kind: paymentKind,
    };
  }

  await prisma.paymentWebhookEvent.update({
    where: { id: event.id },
    data: {
      payload: nextPayload as Prisma.InputJsonObject,
      processed_at: null,
      processing_error: null,
    },
  });

  const job = await producerModule.enqueuePaymentWebhookJob({
    webhookEventId: event.id,
    source: "ops",
    correlationId: `reprocess-${event.id}`,
    jobId: `${contractsModule.PAYMENT_JOB_NAMES.processWebhook}-reprocess-${event.id}-${Date.now()}`,
  });

  console.log(JSON.stringify({ ok: true, webhookEventId: event.id, job }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled(cleanupFns.map((cleanup) => cleanup()));
  });
