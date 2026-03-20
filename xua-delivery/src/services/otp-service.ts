import { createHmac, randomInt } from "crypto";
import db from "@/src/lib/db";
import { otpRepository } from "@/src/repositories/otp-repository";
import { auditRepository } from "@/src/repositories/audit-repository";
import { AuditEventType, ActorType, SourceApp } from "@/src/types/enums";

const OTP_SECRET_RAW = process.env.OTP_SECRET;
if (!OTP_SECRET_RAW) {
  throw new Error("FATAL: OTP_SECRET não definido. Defina a variável de ambiente antes de iniciar.");
}
const OTP_SECRET: string = OTP_SECRET_RAW;
const OTP_TTL_MINUTES = 90;
const MAX_ATTEMPTS = 5;

function hmacHash(code: string): string {
  return createHmac("sha256", OTP_SECRET).update(code).digest("hex");
}

/**
 * OtpService — OTP HMAC-SHA256, TTL 90min, max 5 tentativas (seção 2.4).
 * Texto claro NUNCA persistido no banco.
 */
export const otpService = {
  /**
   * Gera OTP de 6 dígitos e armazena apenas o hash HMAC-SHA256.
   * Retorna o código em texto claro (para enviar via push/SMS ao consumidor).
   */
  async generate(orderId: string, distributorUserId: string): Promise<string> {
    const code = String(randomInt(100000, 999999));
    const hash = hmacHash(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await db.transaction(async (trx) => {
      // Invalida OTPs anteriores do mesmo pedido
      await trx("16_sec_order_otps")
        .where({ order_id: orderId, status: "active" })
        .update({ status: "expired", updated_at: new Date() });

      await otpRepository.create(
        { order_id: orderId, otp_hash: hash, expires_at: expiresAt },
        trx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.OTP_GENERATED,
          actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
          orderId,
          sourceApp: SourceApp.DISTRIBUTOR_WEB,
        },
        trx
      );
    });

    return code;
  },

  /**
   * Valida OTP — max 5 tentativas, após isso status = locked.
   * Retorna true se válido, false se inválido. Lança erro se locked.
   */
  async validate(
    orderId: string,
    code: string,
    driverId: string
  ): Promise<boolean> {
    // FUNC-01: Usa transação com FOR UPDATE para evitar race condition
    return db.transaction(async (trx) => {
      const otp = await otpRepository.findActiveForUpdate(orderId, trx);

      if (!otp) {
        throw new Error("OTP_NOT_FOUND");
      }

      if (otp.expires_at < new Date()) {
        await otpRepository.markUsed(otp.id, trx);
        throw new Error("OTP_EXPIRED");
      }

      if (otp.attempts >= MAX_ATTEMPTS) {
        await otpRepository.markLocked(otp.id, trx);
        throw new Error("OTP_LOCKED");
      }

      const hash = hmacHash(code);
      const isValid = hash === otp.otp_hash;

      if (isValid) {
        await otpRepository.markUsed(otp.id, trx);
      } else {
        const updated = await otpRepository.incrementAttempts(otp.id, trx);
        if (updated.attempts >= MAX_ATTEMPTS) {
          await otpRepository.markLocked(otp.id, trx);
        }
      }

      await auditRepository.emit(
        {
          eventType: AuditEventType.OTP_VALIDATION_ATTEMPTED,
          actor: { type: ActorType.DRIVER, id: driverId },
          orderId,
          sourceApp: SourceApp.DRIVER_WEB,
          payload: { success: isValid, attempts: otp.attempts + 1 },
        },
        trx
      );

      return isValid;
    });
  },

  /**
   * Override de OTP — somente roles ops/support com motivo obrigatório (seção Fluxo 4).
   */
  async override(
    orderId: string,
    actorId: string,
    reason: string
  ): Promise<void> {
    await db.transaction(async (trx) => {
      // Marca OTP como usado independente da validação
      const otp = await otpRepository.findActive(orderId);
      if (otp) {
        await otpRepository.markUsed(otp.id, trx);
      }

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_DELIVERED,
          actor: { type: ActorType.SUPPORT, id: actorId },
          orderId,
          sourceApp: SourceApp.OPS_CONSOLE,
          payload: { override: true, reason },
        },
        trx
      );
    });
  },
};
