import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors";
import { logger } from "../infra/logger";

interface ErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}

/** Erro conhecido do Prisma: violação de unique constraint. */
function isUniqueViolation(err: unknown): boolean {
  return Boolean(
    err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "P2002"
  );
}

/** Convenção legada: erros soltos carregando `status` (ex.: libs de terceiros). */
function legacyStatus(err: unknown): number | null {
  if (err instanceof Error && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 600) return status;
  }
  return null;
}

function toResponse(err: unknown): { status: number; body: ErrorResponse } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: {
        error: err.message,
        code: err.code,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    };
  }

  // Schemas do @xua/shared que escapam do safeParse do controller.
  if (err instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: err.issues[0]?.message ?? "Dados inválidos",
        code: "VALIDATION_ERROR",
        details: err.issues,
      },
    };
  }

  if (isUniqueViolation(err)) {
    return { status: 409, body: { error: "Registro já existe", code: "CONFLICT" } };
  }

  const status = legacyStatus(err);
  if (status !== null && err instanceof Error) {
    return { status, body: { error: err.message } };
  }

  return { status: 500, body: { error: "Erro interno", code: "INTERNAL_ERROR" } };
}

/**
 * Último middleware da cadeia (4 parâmetros — é assim que o Express o
 * identifica). É aqui, e só aqui, que um erro vira resposta HTTP: os
 * controllers repassam tudo com `next(err)` em vez de montar `res.status(...)`
 * por conta própria, o que antes fazia o formato divergir entre módulos.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Resposta já iniciada: só o Express consegue encerrar a conexão daqui.
  if (res.headersSent) {
    next(err);
    return;
  }

  const { status, body } = toResponse(err);

  const context = { err, method: req.method, path: req.originalUrl, status };
  if (status >= 500) {
    logger.error(context, "Unhandled error");
  } else {
    logger.warn(
      { method: req.method, path: req.originalUrl, status, code: body.code, message: body.error },
      "Client error"
    );
  }

  res.status(status).json(body);
};
