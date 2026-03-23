import { otpRepository } from "@/src/repositories/otp-repository";

/**
 * Cron job: expira OTPs ativos além do TTL (90 min).
 * Executado a cada 15 minutos via node-cron no server.ts.
 */
export async function otpCleanupCron(): Promise<void> {
  try {
    const expired = await otpRepository.expireOldOtps();
    if (expired > 0) {
      console.log(`[otp-cleanup] ${expired} OTPs expirados`);
    }
  } catch (error) {
    console.error("[otp-cleanup] Erro:", error);
  }
}
