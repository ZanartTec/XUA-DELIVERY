import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("@api/infra/logger", () => ({
  logger: { error: mocks.loggerError, warn: mocks.loggerWarn, info: vi.fn() },
}));

const { errorHandler } = await import("@api/middleware/error-handler.js");
const { AppError, badRequest, forbidden, notFound } = await import("@api/errors/index.js");

function req(): Request {
  return { method: "GET", originalUrl: "/api/teste" } as unknown as Request;
}

function res(headersSent = false) {
  const response = {
    headersSent,
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  response.status.mockReturnValue(response);
  return response;
}

function handle(err: unknown, response = res()) {
  const next = vi.fn();
  errorHandler(err, req(), response, next);
  return { response, next };
}

describe("errorHandler", () => {
  describe("AppError", () => {
    it("usa o status do registry a partir do code", () => {
      const { response } = handle(new AppError("ORDER_NOT_FOUND", "Pedido não encontrado"));

      expect(response.status).toHaveBeenCalledWith(404);
      expect(response.json).toHaveBeenCalledWith({
        error: "Pedido não encontrado",
        code: "ORDER_NOT_FOUND",
      });
    });

    it("cai em 400 para code desconhecido, como os mapas antigos faziam", () => {
      const { response } = handle(new AppError("CODE_QUE_NAO_EXISTE", "Algo"));

      expect(response.status).toHaveBeenCalledWith(400);
    });

    it("respeita status explícito acima do registry", () => {
      const { response } = handle(
        new AppError("ORDER_NOT_FOUND", "Pedido não encontrado", { status: 410 })
      );

      expect(response.status).toHaveBeenCalledWith(410);
    });

    it("inclui details quando o erro traz (ex.: conflitos de cobertura)", () => {
      const conflitos = [{ neighborhood: "Centro" }];
      const { response } = handle(
        new AppError("COVERAGE_CONFLICT", "Conflito", { details: conflitos })
      );

      expect(response.status).toHaveBeenCalledWith(409);
      expect(response.json).toHaveBeenCalledWith({
        error: "Conflito",
        code: "COVERAGE_CONFLICT",
        details: conflitos,
      });
    });

    it("omite details quando não há", () => {
      const { response } = handle(badRequest("Dados inválidos"));

      expect(response.json).toHaveBeenCalledWith({
        error: "Dados inválidos",
        code: "BAD_REQUEST",
      });
    });

    it.each([
      [forbidden(), 403, "FORBIDDEN", "Acesso negado"],
      [notFound("Sumiu"), 404, "NOT_FOUND", "Sumiu"],
    ])("mapeia o atalho %#", (err, status, code, message) => {
      const { response } = handle(err);

      expect(response.status).toHaveBeenCalledWith(status);
      expect(response.json).toHaveBeenCalledWith({ error: message, code });
    });
  });

  it("traduz ZodError que escapou do controller em 400", () => {
    const schema = z.object({ nome: z.string() });
    const result = schema.safeParse({ nome: 123 });
    if (result.success) expect.unreachable("o parse deveria falhar");

    const { response } = handle(result.error);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "VALIDATION_ERROR" })
    );
  });

  it("traduz violação de unique do Prisma (P2002) em 409", () => {
    const { response } = handle({ code: "P2002", message: "Unique constraint failed" });

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({ error: "Registro já existe", code: "CONFLICT" });
  });

  it("respeita a convenção legada de erros com `status`", () => {
    const legado = Object.assign(new Error("Pagamento recusado"), { status: 402 });

    const { response } = handle(legado);

    expect(response.status).toHaveBeenCalledWith(402);
    expect(response.json).toHaveBeenCalledWith({ error: "Pagamento recusado" });
  });

  it("não vaza mensagem de erro inesperado para o cliente", () => {
    const { response } = handle(new Error("connect ECONNREFUSED 10.0.0.1:5432"));

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ error: "Erro interno", code: "INTERNAL_ERROR" });
  });

  describe("logging", () => {
    it("loga 5xx como error, com o erro original", () => {
      const boom = new Error("boom");
      handle(boom);

      expect(mocks.loggerError).toHaveBeenCalledWith(
        expect.objectContaining({ err: boom, status: 500 }),
        "Unhandled error"
      );
    });

    it("loga 4xx como warn, sem stack trace", () => {
      mocks.loggerWarn.mockClear();
      handle(notFound("Pedido não encontrado"));

      expect(mocks.loggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, code: "NOT_FOUND" }),
        "Client error"
      );
    });
  });

  it("delega ao Express quando a resposta já começou", () => {
    const { response, next } = handle(new Error("tarde demais"), res(true));

    expect(response.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});
