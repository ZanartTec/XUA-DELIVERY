import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/src/lib/prisma";
import { auditRepository } from "@/src/repositories/audit-repository";
import { AuditEventType, ActorType, SourceApp, PaymentKind } from "@/src/types/enums";

const WEBHOOK_SECRET_RAW = process.env.PAYMENT_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET_RAW) {
  throw new Error("FATAL: PAYMENT_WEBHOOK_SECRET não definido");
}
const WEBHOOK_SECRET: string = WEBHOOK_SECRET_RAW;

export async function POST(req: NextRequest) {
  // SEC-04: Verificação de assinatura HMAC do gateway
  const signature = req.headers.get("x-webhook-signature");
  if (!signature) {
    return NextResponse.json({ error: "Assinatura ausente" }, { status: 401 });
  }

  const rawBody = await req.text();
  const expectedSig = createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  try {
    const sigBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSig, "hex");

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);

  const { event, payment_id, order_id, status } = body as {
    event: string;
    payment_id: string;
    order_id: string;
    status: string;
  };

  if (!event || !payment_id || !order_id) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  // Idempotency: skip if already processed
  const existing = await prisma.payment.findUnique({
    where: { external_id: payment_id },
  });

  if (existing && existing.status === status) {
    return NextResponse.json({ ok: true, msg: "already processed" });
  }

  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.payment.update({
        where: { external_id: payment_id },
        data: { status: status as never },
      });
    } else {
      await tx.payment.create({
        data: {
          external_id: payment_id,
          order_id,
          status: status as never,
          kind: PaymentKind.ORDER,
          amount_cents: body.amount_cents ?? 0,
        },
      });
    }

    if (status === "approved") {
      await tx.order.update({
        where: { id: order_id },
        data: { payment_status: "paid" },
      });
    } else if (status === "refunded") {
      await tx.order.update({
        where: { id: order_id },
        data: { payment_status: "refunded" },
      });
    }

    await auditRepository.emit(
      {
        eventType: AuditEventType.PAYMENT_CAPTURED,
        actor: { type: ActorType.SYSTEM, id: "gateway" },
        orderId: order_id,
        sourceApp: SourceApp.BACKEND,
        payload: { event, payment_id, status },
      },
      tx
    );
  });

  return NextResponse.json({ ok: true });
}
