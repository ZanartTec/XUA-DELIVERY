import type { Request, Response } from "express";

// GET /health — liveness probe.
// Sempre 200 enquanto o processo estiver de pé.
export function healthHandler(_req: Request, res: Response): void {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
