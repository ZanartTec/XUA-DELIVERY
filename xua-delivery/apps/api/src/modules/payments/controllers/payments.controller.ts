import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ONLINE_PAYMENT_METHOD_VALUES } from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { enqueuePaymentWebhookJob, PAYMENT_JOB_NAMES } from "../../../infra/queue/index.js";
import { logger } from "../../../infra/logger/index.js";
import { PAYMENT_PROVIDERS } from "../gateway/payments.gateway.js";
import { paymentService, PaymentServiceError } from "../services/payments.service.js";

const chargeSchema = z.object({
  order_id: z.string().uuid(),
  payment_method: z.enum(ONLINE_PAYMENT_METHOD_VALUES),
});

function errorStatus(code: string): number {
  const map: Record<string, number> = {
    ORDER_NOT_FOUND: 404,
    INVALID_ORDER_STATUS: 409,
    PROVIDER_REDIRECT_MISSING: 502,
  };
  return map[code] ?? 400;
}

function getWebhookSecret(): string | null {
  return process.env.MERCADOPAGO_WEBHOOK_SECRET ?? process.env.PAYMENT_WEBHOOK_SECRET ?? null;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function queryValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function sanitizedWebhookHeaders(req: Request): Record<string, string> {
  const signature = headerValue(req.headers["x-signature"]);
  const { ts } = signature ? parseSignatureHeader(signature) : {};
  const headers: Record<string, string> = {};
  for (const key of ["x-request-id", "x-topic", "x-resource-id", "user-agent"]) {
    const value = headerValue(req.headers[key]);
    if (value) headers[key] = value;
  }
  if (ts) headers["x-signature-ts"] = ts;
  if (signature) headers["x-signature-present"] = "true";
  return headers;
}

function parseSignatureHeader(signature: string): { ts?: string; v1?: string } {
  return signature.split(",").reduce<{ ts?: string; v1?: string }>((acc, part) => {
    const [key, value] = part.split("=", 2).map((item) => item.trim());
    if (key === "ts") acc.ts = value;
    if (key === "v1") acc.v1 = value;
    return acc;
  }, {});
}

function isTimestampFresh(ts: string): boolean {
  const raw = Number(ts);
  if (!Number.isFinite(raw)) return false;
  const timestampMs = ts.length >= 13 ? raw : raw * 1000;
  const toleranceSeconds = Number(process.env.MERCADOPAGO_WEBHOOK_TOLERANCE_SECONDS ?? "600");
  return Math.abs(Date.now() - timestampMs) <= toleranceSeconds * 1000;
}

function safeEqualHex(left: string, right: string): boolean {
  try {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

interface SignatureValidationResult {
  valid: boolean;
  resourceId?: string;
  requestId?: string;
  reason?: string;
}

function bodyData(body: Record<string, unknown>): Record<string, unknown> | null {
  return body.data && typeof body.data === "object" && !Array.isArray(body.data)
    ? body.data as Record<string, unknown>
    : null;
}

function getResourceId(req: Request, body: Record<string, unknown>): string | undefined {
  const data = bodyData(body);
  return queryValue(req.query["data.id"]) ?? (data?.id != null ? String(data.id) : undefined);
}

function validateMercadoPagoSignature(req: Request, body: Record<string, unknown>): SignatureValidationResult {
  const secret = getWebhookSecret();
  if (!secret) {
    logger.error("MERCADOPAGO_WEBHOOK_SECRET não definido");
    return { valid: false, reason: "missing_secret" };
  }

  const signature = headerValue(req.headers["x-signature"]);
  const requestId = headerValue(req.headers["x-request-id"]);
  if (!signature || !requestId) return { valid: false, reason: "missing_signature_headers" };

  const { ts, v1 } = parseSignatureHeader(signature);
  if (!ts || !v1) return { valid: false, reason: "invalid_signature_format", requestId };
  if (!isTimestampFresh(ts)) return { valid: false, reason: "stale_signature", requestId };

  const dataId = getResourceId(req, body);
  if (!dataId) return { valid: false, reason: "missing_resource_id", requestId };

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const valid = safeEqualHex(v1, expected);
  return {
    valid,
    reason: valid ? undefined : "signature_mismatch",
    resourceId: dataId,
    requestId,
  };
}

function getEventType(req: Request, body: Record<string, unknown>): string {
  if (body.type != null) return String(body.type);
  if (body.action != null) return String(body.action);
  return queryValue(req.query.type) ?? queryValue(req.query.topic) ?? "payment";
}

function isPaymentNotification(req: Request, body: Record<string, unknown>): boolean {
  const type = body.type != null ? String(body.type) : queryValue(req.query.type);
  const action = body.action != null ? String(body.action) : queryValue(req.query.action);
  const topic = queryValue(req.query.topic);

  return type === "payment" || topic === "payment" || Boolean(action?.startsWith("payment."));
}

function buildWebhookPayload(body: Record<string, unknown>, resourceId: string): Prisma.InputJsonObject {
  const data = bodyData(body);
  return {
    ...body,
    data: {
      ...(data ?? {}),
      id: data?.id ?? resourceId,
    },
  } as Prisma.InputJsonObject;
}

function getProviderEventRef(body: Record<string, unknown>, resourceId: string): string {
  if (body.id != null) return String(body.id);
  const action = body.action != null ? String(body.action) : "event";
  const type = body.type != null ? String(body.type) : "payment";
  return `${type}:${resourceId}:${action}`;
}

export const paymentsController = {
  async charge(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const parsed = chargeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const result = await paymentService.createCheckoutPayment(
        parsed.data.order_id,
        user.sub,
        parsed.data.payment_method
      );

      res.status(201).json({
        payment: {
          id: result.payment.id,
          status: result.status,
          amount_cents: result.payment.amount_cents,
          provider: result.payment.provider,
          preference_id: result.preferenceId,
        },
        redirectUrl: result.redirectUrl,
      });
    } catch (error) {
      if (error instanceof PaymentServiceError) {
        res.status(errorStatus(error.code)).json({ error: error.message, code: error.code });
        return;
      }
      logger.error({ err: error }, "Error creating Mercado Pago checkout payment");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  async status(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const orderId = req.params.orderId as string;

    try {
      const result = await paymentService.getOrderPaymentStatus(orderId, user.sub);
      res.json(result);
    } catch (error) {
      if (error instanceof PaymentServiceError) {
        res.status(errorStatus(error.code)).json({ error: error.message, code: error.code });
        return;
      }
      logger.error({ err: error }, "Error fetching payment status");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /**
   * POST /api/payments/webhook
   * Endpoint público; Mercado Pago assina via x-signature + x-request-id.
   */
  async webhook(req: Request, res: Response): Promise<void> {
    const body = req.body as Record<string, unknown>;
    const signature = validateMercadoPagoSignature(req, body);
    const { resourceId, requestId } = signature;
    if (!signature.valid || !resourceId) {
      logger.warn({ reason: signature.reason }, "Mercado Pago webhook rejected");
      res.status(401).json({ error: "Assinatura inválida" });
      return;
    }

    if (!isPaymentNotification(req, body)) {
      res.status(202).json({ ok: true, ignored: true });
      return;
    }

    const prisma = getPrisma();
    const providerEventRef = getProviderEventRef(body, resourceId);
    const eventType = getEventType(req, body);
    const correlationId = requestId ?? randomUUID();

    try {
      let event = await prisma.paymentWebhookEvent.findUnique({
        where: {
          provider_provider_event_ref: {
            provider: PAYMENT_PROVIDERS.mercadoPago,
            provider_event_ref: providerEventRef,
          },
        },
      });

      if (!event) {
        event = await prisma.paymentWebhookEvent.create({
          data: {
            provider: PAYMENT_PROVIDERS.mercadoPago,
            provider_event_ref: providerEventRef,
            event_type: eventType,
            payload: buildWebhookPayload(body, resourceId),
            raw_headers: sanitizedWebhookHeaders(req) as Prisma.InputJsonObject,
            signature_valid: true,
          },
        });
      }

      if (!event.processed_at) {
        await enqueuePaymentWebhookJob({
          webhookEventId: event.id,
          source: "api",
          correlationId,
          jobId: `${PAYMENT_JOB_NAMES.processWebhook}-${event.id}`,
        });
      }

      res.status(200).json({ ok: true });
    } catch (error) {
      logger.error({ err: error, providerEventRef }, "Error accepting Mercado Pago webhook");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
