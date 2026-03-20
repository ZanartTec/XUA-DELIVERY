import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import db from "@/src/lib/db";
import { TABLES } from "@/src/lib/tables";
import { auditRepository } from "@/src/repositories/audit-repository";
import { AuditEventType, ActorType, SourceApp } from "@/src/types/enums";

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
  const existing = await db(TABLES.PAYMENTS)
    .where({ external_id: payment_id })
    .first();

  if (existing && existing.status === status) {
    return NextResponse.json({ ok: true, msg: "already processed" });
  }

  await db.transaction(async (trx: import("knex").Knex.Transaction) => {
    if (existing) {
      await trx(TABLES.PAYMENTS)
        .where({ external_id: payment_id })
        .update({ status, updated_at: new Date() });
    } else {
      await trx(TABLES.PAYMENTS).insert({
        external_id: payment_id,
        order_id,
        status,
        kind: "pix",
        amount_cents: body.amount_cents ?? 0,
      });
    }

    if (status === "approved") {
      await trx(TABLES.ORDERS).where({ id: order_id }).update({
        payment_status: "paid",
      });
    } else if (status === "refunded") {
      await trx(TABLES.ORDERS).where({ id: order_id }).update({
        payment_status: "refunded",
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
      trx
    );
  });

  return NextResponse.json({ ok: true });
}
