import { Router } from "express";
import type { Request, Response } from "express";
import { internalJobAuth } from "./internal-job-auth.js";
import { runSubscriptionJob } from "./subscription-job.js";
import { runOtpCleanupJob } from "./otp-cleanup-job.js";
import { logger } from "../infra/logger/index.js";

const router = Router();

router.use(internalJobAuth);

/** POST /api/internal/jobs/subscription */
router.post("/subscription", async (_req: Request, res: Response): Promise<void> => {
  const start = Date.now();
  logger.info("subscription-job: início");

  try {
    const result = await runSubscriptionJob();
    const durationMs = Date.now() - start;
    logger.info({ ...result, durationMs }, "subscription-job: concluído");
    res.json({ ok: true, ...result, durationMs });
  } catch (error) {
    const durationMs = Date.now() - start;
    logger.error({ error, durationMs }, "subscription-job: falhou");
    res.status(500).json({ error: "Job failed" });
  }
});

/** POST /api/internal/jobs/otp-cleanup */
router.post("/otp-cleanup", async (_req: Request, res: Response): Promise<void> => {
  const start = Date.now();
  logger.info("otp-cleanup-job: início");

  try {
    const result = await runOtpCleanupJob();
    const durationMs = Date.now() - start;
    logger.info({ ...result, durationMs }, "otp-cleanup-job: concluído");
    res.json({ ok: true, ...result, durationMs });
  } catch (error) {
    const durationMs = Date.now() - start;
    logger.error({ error, durationMs }, "otp-cleanup-job: falhou");
    res.status(500).json({ error: "Job failed" });
  }
});

export { router as jobsRoutes };
