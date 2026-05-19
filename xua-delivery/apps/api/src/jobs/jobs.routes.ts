import { Router } from "express";
import type { Request, Response } from "express";
import { enqueueInternalJob } from "../infra/queue/internal-jobs.producer.js";
import { internalJobAuth } from "./internal-job-auth.js";
import { runSubscriptionJob } from "./subscription-job.js";
import { runOtpCleanupJob } from "./otp-cleanup-job.js";
import { runSubscriptionExpiryJob } from "./subscription-expiry-job.js";
import {
  dispatchOtpCleanup,
  isBullmqOtpCleanupEnabled,
} from "./otp-cleanup-dispatch.js";
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
    const result = await dispatchOtpCleanup({
      useBullmq: isBullmqOtpCleanupEnabled(),
      source: "cron",
      enqueue: enqueueInternalJob,
      runSync: runOtpCleanupJob,
    });
    const durationMs = Date.now() - start;

    if (result.mode === "queued") {
      logger.info(
        {
          jobId: result.jobId,
          correlationId: result.correlationId,
          durationMs,
        },
        "otp-cleanup-job: enfileirado"
      );
      res.json({
        ok: true,
        enqueued: true,
        jobId: result.jobId,
        correlationId: result.correlationId,
        durationMs,
      });
      return;
    }

    if (result.mode === "sync-fallback") {
      logger.warn(
        {
          error: result.enqueueError,
          expired: result.expired,
          durationMs,
        },
        "otp-cleanup-job: falha ao enfileirar, executado em modo síncrono"
      );
      res.json({
        ok: true,
        expired: result.expired,
        durationMs,
        fallback: "sync",
      });
      return;
    }

    logger.info({ expired: result.expired, durationMs }, "otp-cleanup-job: concluído");
    res.json({ ok: true, expired: result.expired, durationMs });
  } catch (error) {
    const durationMs = Date.now() - start;
    logger.error({ error, durationMs }, "otp-cleanup-job: falhou");
    res.status(500).json({ error: "Job failed" });
  }
});

/** POST /api/internal/jobs/subscription-expiry */
router.post("/subscription-expiry", async (_req: Request, res: Response): Promise<void> => {
  const start = Date.now();
  logger.info("subscription-expiry-job: início");

  try {
    const result = await runSubscriptionExpiryJob();
    const durationMs = Date.now() - start;
    logger.info({ ...result, durationMs }, "subscription-expiry-job: concluído");
    res.json({ ok: true, ...result, durationMs });
  } catch (error) {
    const durationMs = Date.now() - start;
    logger.error({ error, durationMs }, "subscription-expiry-job: falhou");
    res.status(500).json({ error: "Job failed" });
  }
});

export { router as jobsRoutes };
