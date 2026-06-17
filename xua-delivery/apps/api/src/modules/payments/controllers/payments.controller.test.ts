import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { PaymentKind } from "@xua/shared/enums";
import { signWebhookContext } from "../utils/webhook-context.js";

const distributorId = "00000000-0000-4000-a000-000000000010";

const mocks = vi.hoisted(() => ({
  enqueuePaymentWebhookJob: vi.fn(),
  distributorGatewayService: {
    getWebhookSecret: vi.fn(),
  },
  prisma: {
    paymentWebhookEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
    },
    userSubscription: {
      findUnique: vi.fn(),
    },
  },
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => mocks.prisma,
}));

vi.mock("../../../infra/queue/index.js", () => ({
  enqueuePaymentWebhookJob: mocks.enqueuePaymentWebhookJob,
  PAYMENT_JOB_NAMES: { processWebhook: "process-webhook" },
}));

vi.mock("../../../infra/logger/index.js", () => ({
  logger: { error: mocks.loggerError, warn: mocks.loggerWarn },
}));

vi.mock("../services/payments.service.js", () => ({
  paymentService: {},
  PaymentServiceError: class PaymentServiceError extends Error {},
}));

vi.mock("../../distributor-gateway/index.js", () => ({
  distributorGatewayService: mocks.distributorGatewayService,
}));

const { paymentsController } = await import("./payments.controller.js");

const secret = "webhook-secret-test";
const resourceId = "1346835923";
const eventId = "7e1d7b55-3f52-4d10-aac3-74387c236901";
const orderId = "7e1d7b55-3f52-4d10-aac3-74387c236902";

function signature(requestId: string, ts: string): string {
  const manifest = `id:${resourceId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

function res() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  response.status.mockReturnValue(response);
  return response;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MERCADOPAGO_WEBHOOK_SECRET = secret;
  process.env.PAYMENT_WEBHOOK_CONTEXT_SECRET = secret;
  mocks.prisma.paymentWebhookEvent.findUnique.mockResolvedValue(null);
  mocks.prisma.paymentWebhookEvent.create.mockImplementation(async ({ data }) => ({
    id: eventId,
    processed_at: null,
    ...data,
  }));
  mocks.enqueuePaymentWebhookJob.mockResolvedValue({ id: "job-1", correlationId: "req-1" });
  mocks.prisma.order.findUnique.mockResolvedValue({ distributor_id: distributorId });
  mocks.distributorGatewayService.getWebhookSecret.mockResolvedValue(secret);
});

describe("paymentsController.webhook", () => {
  it("persiste contexto whitelisted da notification_url", async () => {
    const requestId = "req-1";
    const ts = String(Date.now());
    const response = res();
    const request = {
      body: { type: "payment", action: "payment.updated", data: { id: resourceId } },
      query: {
        "xua_reference_id": orderId,
        "xua_payment_kind": PaymentKind.ORDER,
        "xua_context_sig": signWebhookContext(orderId, PaymentKind.ORDER, secret),
        ignored: "nao-deve-ser-persistido",
      },
      headers: {
        "x-request-id": requestId,
        "x-signature": signature(requestId, ts),
      },
    } as unknown as Request;

    await paymentsController.webhook(request, response);

    expect(mocks.prisma.paymentWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          data: { id: resourceId },
          xua_context: { reference_id: orderId, payment_kind: PaymentKind.ORDER },
        }),
      }),
    });
    expect(mocks.enqueuePaymentWebhookJob).toHaveBeenCalledWith({
      webhookEventId: eventId,
      source: "api",
      correlationId: requestId,
      jobId: `${"process-webhook"}-${eventId}`,
    });
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it("rejeita contexto adulterado com 401", async () => {
    const requestId = "req-2";
    const ts = String(Date.now());
    const response = res();
    const request = {
      body: { type: "payment", action: "payment.updated", data: { id: resourceId } },
      query: {
        "xua_reference_id": orderId,
        "xua_payment_kind": PaymentKind.ORDER,
        "xua_context_sig": "00".repeat(32),
      },
      headers: {
        "x-request-id": requestId,
        "x-signature": signature(requestId, ts),
      },
    } as unknown as Request;

    await paymentsController.webhook(request, response);

    expect(mocks.prisma.paymentWebhookEvent.create).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ hasContextSignature: true }),
      "Mercado Pago webhook context inválido"
    );
    expect(response.status).toHaveBeenCalledWith(401);
  });

  it("aceita webhook duplicado criado por outra requisicao concorrente", async () => {
    const requestId = "req-3";
    const ts = String(Date.now());
    const existingEvent = { id: eventId, processed_at: null };
    const response = res();
    mocks.prisma.paymentWebhookEvent.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingEvent);
    mocks.prisma.paymentWebhookEvent.create.mockRejectedValueOnce({ code: "P2002" });

    await paymentsController.webhook({
      body: { type: "payment", action: "payment.updated", data: { id: resourceId } },
      query: {
        "xua_reference_id": orderId,
        "xua_payment_kind": PaymentKind.ORDER,
        "xua_context_sig": signWebhookContext(orderId, PaymentKind.ORDER, secret),
      },
      headers: {
        "x-request-id": requestId,
        "x-signature": signature(requestId, ts),
      },
    } as unknown as Request, response);

    expect(mocks.enqueuePaymentWebhookJob).toHaveBeenCalledWith(expect.objectContaining({
      webhookEventId: eventId,
      correlationId: requestId,
    }));
    expect(response.status).toHaveBeenCalledWith(200);
  });
});
