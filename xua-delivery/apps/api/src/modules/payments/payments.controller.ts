import type { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import type { Prisma } from "@prisma/client";
import { AuditEventType, ActorType, SourceApp, PaymentKind, PaymentStatus } from "@prisma/client";
import { getPrisma } from "../../infra/prisma/client.js";
import { auditRepository } from "../audit/index.js";
import { logger } from "../../infra/logger/index.js";

type TxClient = Prisma.TransactionClient;

const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET;

export const paymentsController = {
  /**
   * POST /api/payments/webhook
   * SEC-04: Verificação de assinatura HMAC do gateway.
   * Endpoint público (sem authMiddleware) — autenticação via HMAC.
   */
  async webhook(req: Request, res: Response): Promise<void> {
    if (!WEBHOOK_SECRET) {
      logger.error("PAYMENT_WEBHOOK_SECRET não definido");
      res.status(500).json({ error: "Configuração inválida" });
      return;
    }

    // SEC-04: Verificação de assinatura HMAC
    const signature = req.headers["x-webhook-signature"] as string | undefined;
    if (!signature) {
      res.status(401).json({ error: "Assinatura ausente" });
      return;
    }

    // rawBody é disponibilizado por express.raw() ou express.text() no middleware
    const rawBody =
      typeof req.body === "string"
        ? req.body
        : Buffer.isBuffer(req.body)
          ? req.body.toString("utf-8")
          : JSON.stringify(req.body);

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
        res.status(401).json({ error: "Assinatura inválida" });
        return;
      }
    } catch {
      res.status(401).json({ error: "Assinatura inválida" });
      return;
    }

    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const { event, payment_id, order_id, status: rawStatus } = body as {
      event: string;
      payment_id: string;
      order_id: string;
      status: string;
    };

    const paymentStatus = rawStatus as PaymentStatus;

    if (!event || !payment_id || !order_id) {
      res.status(400).json({ error: "Payload inválido" });
      return;
    }

    try {
      const prisma = getPrisma();

      // Idempotency: skip if already processed
      const existing = await prisma.payment.findUnique({
        where: { external_id: payment_id },
      });

      if (existing && existing.status === paymentStatus) {
        res.json({ ok: true, msg: "already processed" });
        return;
      }

      await prisma.$transaction(async (tx: TxClient) => {
        if (existing) {
          await tx.payment.update({
            where: { external_id: payment_id },
            data: { status: paymentStatus },
          });
        } else {
          await tx.payment.create({
            data: {
              external_id: payment_id,
              order_id,
              status: paymentStatus,
              kind: PaymentKind.ORDER,
              amount_cents: body.amount_cents ?? 0,
            },
          });
        }

        if (rawStatus === "approved") {
          await tx.order.update({
            where: { id: order_id },
            data: { payment_status: "paid" },
          });
        } else if (rawStatus === "refunded") {
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
            payload: { event, payment_id, status: rawStatus },
          },
          tx
        );
      });

      res.json({ ok: true });
    } catch (error) {
      logger.error({ error }, "Error processing payment webhook");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
