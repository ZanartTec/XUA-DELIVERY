import type { Request, Response } from "express";

// GET /readiness — readiness probe.
// PR 03: verifica apenas que o servidor Express está pronto.
// PR 04: adiciona verificações de database (Prisma) e cache (Redis).
type CheckStatus = "ok" | "error";

interface ReadinessChecks {
  server: CheckStatus;
  database?: CheckStatus;
  redis?: CheckStatus;
}

export async function readinessHandler(
  _req: Request,
  res: Response
): Promise<void> {
  const checks: ReadinessChecks = {
    server: "ok",
    // database e redis são adicionados no PR 04
  };

  const allOk = Object.values(checks).every((v) => v === "ok");

  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ready" : "not_ready",
    checks,
    timestamp: new Date().toISOString(),
  });
}
