import { createHmac, randomInt } from "crypto";
import { OtpStatus, AuditEventType, ActorType, SourceApp, Prisma } from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";
import { otpRepository } from "../repository/otp.repository.js";
import { auditRepository } from "../../audit/audit.repository.js";
import { createLogger } from "../../../infra/logger/index.js";

const logger = createLogger("otp");

type TxClient = Prisma.TransactionClient;

// OTP_SECRET é obrigatório — lança erro fatal se não definido
const OTP_SECRET_RAW = process.env.OTP_SECRET;
if (!OTP_SECRET_RAW) {
  logger.fatal("FATAL: OTP_SECRET não definido. Defina a variável de ambiente antes de iniciar.");
  // Em dev, permite continuar com secret padrão (NÃO usar em produção)
  if (process.env.NODE_ENV !== "production") {
    logger.warn("Usando OTP_SECRET padrão para desenvolvimento. NÃO use em produção!");
  } else {
    throw new Error("FATAL: OTP_SECRET não definido");
  }
}
const OTP_SECRET: string = OTP_SECRET_RAW ?? "dev-secret-do-not-use-in-production";
const OTP_TTL_MINUTES = 90;
const MAX_ATTEMPTS = 5;

function hmacHash(code: string): string {
  return createHmac("sha256", OTP_SECRET).update(code).digest("hex");
}

export class OtpServiceError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "OtpServiceError";
  }
}

export interface OtpValidationResult {
  isValid: boolean;
  attempts: number;
  maxAttempts: number;
  locked: boolean;
}

/**
 * OtpService — OTP HMAC-SHA256, TTL 90min, max 5 tentativas (seção 2.4).
 * Texto claro NUNCA persistido no banco — apenas hash HMAC.
 */
export const otpService = {
  /**
   * Gera OTP de 6 dígitos e armazena apenas o hash HMAC-SHA256.
   * Retorna o código em texto claro (para enviar via push/SMS ao consumidor).
   */
  async generate(orderId: string, distributorUserId: string): Promise<string> {
    const prisma = getPrisma();
    const code = String(randomInt(100000, 999999));
    const hash = hmacHash(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await prisma.$transaction(async (tx: TxClient) => {
      // Invalida OTPs anteriores do mesmo pedido
      await tx.orderOtp.updateMany({
        where: { order_id: orderId, status: OtpStatus.ACTIVE },
        data: { status: OtpStatus.EXPIRED },
      });

      await otpRepository.create(
        { order_id: orderId, otp_hash: hash, expires_at: expiresAt },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.OTP_GENERATED,
          actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
          orderId,
          sourceApp: SourceApp.DISTRIBUTOR_WEB,
        },
        tx
      );
    });

    logger.info({ orderId }, "OTP generated");
    return code;
  },

  /**
   * Valida OTP — max 5 tentativas, após isso status = locked.
   * Retorna true se válido, false se inválido.
   * @throws OtpServiceError se OTP não encontrado, expirado ou locked
   */
  async validate(orderId: string, code: string, driverId: string): Promise<OtpValidationResult> {
    const prisma = getPrisma();

    // FUNC-01: Usa transação com FOR UPDATE para evitar race condition
    return prisma.$transaction(async (tx: TxClient) => {
      const otp = await otpRepository.findActiveForUpdate(orderId, tx);

      if (!otp) {
        throw new OtpServiceError("OTP_NOT_FOUND", "OTP não encontrado");
      }

      if (otp.expires_at < new Date()) {
        await otpRepository.markUsed(otp.id, tx);
        throw new OtpServiceError("OTP_EXPIRED", "OTP expirado");
      }

      if (otp.attempts >= MAX_ATTEMPTS) {
        await otpRepository.markLocked(otp.id, tx);
        throw new OtpServiceError("OTP_LOCKED", "OTP bloqueado por excesso de tentativas");
      }

      const hash = hmacHash(code);
      const isValid = hash === otp.otp_hash;

      let attempts = otp.attempts + 1;
      let locked = false;

      if (isValid) {
        await otpRepository.markUsed(otp.id, tx);
      } else {
        const updated = await otpRepository.incrementAttempts(otp.id, tx);
        attempts = updated.attempts;
        if (updated.attempts >= MAX_ATTEMPTS) {
          await otpRepository.markLocked(otp.id, tx);
          locked = true;
        }
      }

      await auditRepository.emit(
        {
          eventType: AuditEventType.OTP_VALIDATION_ATTEMPTED,
          actor: { type: ActorType.DRIVER, id: driverId },
          orderId,
          sourceApp: SourceApp.DRIVER_WEB,
          payload: { success: isValid, attempts },
        },
        tx
      );

      logger.info({ orderId, isValid, attempts }, "OTP validation attempted");
      return { isValid, attempts, maxAttempts: MAX_ATTEMPTS, locked };
    });
  },

  /**
   * Override de OTP — somente roles ops/support com motivo obrigatório (seção Fluxo 4).
   * Marca OTP como usado sem validar código.
   */
  async override(orderId: string, actorId: string, reason: string): Promise<void> {
    const prisma = getPrisma();

    await prisma.$transaction(async (tx: TxClient) => {
      // Marca OTP como usado independente da validação
      const otp = await otpRepository.findActive(orderId, tx);
      if (otp) {
        await otpRepository.markUsed(otp.id, tx);
      }

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_DELIVERED,
          actor: { type: ActorType.SUPPORT, id: actorId },
          orderId,
          sourceApp: SourceApp.OPS_CONSOLE,
          payload: { override: true, reason },
        },
        tx
      );
    });

    logger.warn({ orderId, actorId, reason }, "OTP override by support");
  },
};
