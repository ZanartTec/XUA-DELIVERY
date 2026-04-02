import { otpRepository } from "../modules/driver/otp.repository.js";
import { logger } from "../infra/logger/index.js";

/**
 * Job handler: expira OTPs ativos além do TTL (90 min).
 * Chamado via HTTP POST pelo Render Cron Job (cada 15 min).
 */
export async function runOtpCleanupJob(): Promise<{ expired: number }> {
  const expired = await otpRepository.expireOldOtps();

  if (expired > 0) {
    logger.info({ expired }, "otp-cleanup-job: OTPs expirados");
  }

  return { expired };
}
