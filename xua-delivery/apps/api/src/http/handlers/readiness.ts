import type { Request, Response } from "express";
import { prisma } from "../../infra/prisma/client";
import redis from "../../infra/redis/client";
import { logger } from "../../infra/logger";

type CheckStatus = "ok" | "error";

interface ReadinessChecks {
  server: CheckStatus;
  database: CheckStatus;
  cache_redis: CheckStatus;
}

/**
 * Readiness probe.
 *
 * Semântica dos checks:
 * - `database` é CRÍTICO: falha ⇒ 503 (`not_ready`) — a API não atende sem banco.
 * - `cache_redis` é NÃO-crítico: falha ⇒ 200 (`degraded`) — cache é opcional,
 *   a API continua atendendo leituras direto do banco.
 * - Redis de fila não é checado aqui: a API atende leitura sem fila.
 */
export async function readinessHandler(
  _req: Request,
  res: Response
): Promise<void> {
  const checks: ReadinessChecks = {
    server: "ok",
    database: "error",
    cache_redis: "error",
  };

  // Database check (crítico)
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (err) {
    logger.warn({ err }, "Readiness: database check failed");
  }

  // Cache Redis check (não-crítico)
  try {
    await redis.ping();
    checks.cache_redis = "ok";
  } catch (err) {
    logger.warn({ err }, "Readiness: cache redis check failed (non-critical)");
  }

  const databaseOk = checks.database === "ok";
  const status = !databaseOk
    ? "not_ready"
    : checks.cache_redis === "ok"
      ? "ready"
      : "degraded";

  res.status(databaseOk ? 200 : 503).json({
    status,
    checks,
    timestamp: new Date().toISOString(),
  });
}
