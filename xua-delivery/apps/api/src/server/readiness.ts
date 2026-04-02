import type { Request, Response } from "express";
import { prisma } from "../infra/prisma/client";
import redis from "../infra/redis/client";
import { logger } from "../infra/logger";

type CheckStatus = "ok" | "error";

interface ReadinessChecks {
  server: CheckStatus;
  database: CheckStatus;
  redis: CheckStatus;
}

export async function readinessHandler(
  _req: Request,
  res: Response
): Promise<void> {
  const checks: ReadinessChecks = {
    server: "ok",
    database: "error",
    redis: "error",
  };

  // Database check
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (err) {
    logger.warn({ err }, "Readiness: database check failed");
  }

  // Redis check
  try {
    await redis.ping();
    checks.redis = "ok";
  } catch (err) {
    logger.warn({ err }, "Readiness: redis check failed");
  }

  const allOk = Object.values(checks).every((v) => v === "ok");

  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ready" : "not_ready",
    checks,
    timestamp: new Date().toISOString(),
  });
}
