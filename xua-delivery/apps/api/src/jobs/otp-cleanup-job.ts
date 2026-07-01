import { otpRepository } from "../modules/driver/repository/otp.repository.js";
import { passwordResetRepository } from "../modules/auth/repository/password-reset.repository.js";
import { logger } from "../infra/logger/index.js";

/**
 * Job handler: expira OTPs ativos além do TTL (90 min) e remove tokens de
 * redefinição de senha já usados/expirados. Chamado via HTTP POST pelo
 * Render Cron Job (cada 15 min).
 */
export async function runOtpCleanupJob(): Promise<{
  expired: number;
  purgedResetTokens: number;
}> {
  const expired = await otpRepository.expireOldOtps();
  const purgedResetTokens = await passwordResetRepository.deleteExpired();

  if (expired > 0) {
    logger.info({ expired }, "otp-cleanup-job: OTPs expirados");
  }
  if (purgedResetTokens > 0) {
    logger.info({ purgedResetTokens }, "otp-cleanup-job: tokens de reset removidos");
  }

  return { expired, purgedResetTokens };
}
