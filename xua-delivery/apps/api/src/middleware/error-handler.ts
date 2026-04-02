import type { ErrorRequestHandler } from "express";
import { logger } from "../infra/logger";

// Adaptado de src/lib/api-handler.ts do monólito.
// Middleware de 4 parâmetros — Express identifica como error handler.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status =
    err instanceof Error && "status" in err
      ? (err as { status: number }).status
      : 500;

  if (status >= 500) {
    logger.error({ err }, "Unhandled error");
  } else {
    logger.warn({ status, message: err.message }, "Client error");
  }

  res.status(status).json({
    error: status === 500 ? "Internal server error" : err.message,
  });
};
