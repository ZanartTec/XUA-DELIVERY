import { createHmac, randomBytes } from "crypto";
import { hashPassword } from "../../../infra/auth/password.js";
import { getPrisma } from "../../../infra/prisma/client.js";
import { authRepository } from "../repository/auth.repository.js";
import { passwordResetRepository } from "../repository/password-reset.repository.js";
import { sendMail } from "../../../infra/mail/mailer.js";
import { markPasswordChanged } from "../../../infra/auth/password-change.js";
import { createLogger } from "../../../infra/logger/index.js";
import { AuthServiceError } from "./auth.service.js";

const log = createLogger("password-reset");

// Segredo para o HMAC do token — mesmo padrão do OTP_SECRET.
const RESET_SECRET_RAW = process.env.PASSWORD_RESET_SECRET;
if (!RESET_SECRET_RAW) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("FATAL: PASSWORD_RESET_SECRET não definido. Defina antes de iniciar.");
  }
  log.warn("PASSWORD_RESET_SECRET ausente — usando segredo dev. NÃO use em produção!");
}
const RESET_SECRET: string = RESET_SECRET_RAW ?? "dev-password-reset-secret-do-not-use-in-production";

const TOKEN_TTL_MINUTES = 30;

/** HMAC-SHA256 do token em claro. Só o hash é persistido no banco. */
function hashToken(token: string): string {
  return createHmac("sha256", RESET_SECRET).update(token).digest("hex");
}

function buildResetLink(rawToken: string): string {
  const base = (process.env.APP_ORIGIN ?? "http://localhost:3001").replace(/\/$/, "");
  return `${base}/reset-password?token=${rawToken}`;
}

function resetEmailHtml(name: string, link: string): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0d1b2f">
    <h2 style="color:#1B4A9A;margin:0 0 16px">Redefinição de senha</h2>
    <p>Olá, ${name.split(" ")[0] || "cliente"}!</p>
    <p>Recebemos um pedido para redefinir a senha da sua conta Xuá Delivery.
       Clique no botão abaixo para criar uma nova senha:</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${link}"
         style="background:#00E0FF;color:#001735;text-decoration:none;font-weight:bold;
                padding:12px 28px;border-radius:12px;display:inline-block">
        Redefinir minha senha
      </a>
    </p>
    <p style="font-size:13px;color:#7d8494">
      Este link expira em ${TOKEN_TTL_MINUTES} minutos e só pode ser usado uma vez.
      Se você não solicitou a redefinição, ignore este e-mail — sua senha continua a mesma.
    </p>
    <p style="font-size:12px;color:#9ba3af;word-break:break-all">
      Se o botão não funcionar, copie e cole este link no navegador:<br>${link}
    </p>
  </div>`;
}

export const passwordResetService = {
  /**
   * Solicita redefinição de senha. NUNCA revela se o e-mail existe — a resposta
   * do controller é sempre uniforme. Falha de envio de e-mail é logada, não propagada.
   */
  async requestReset(email: string): Promise<void> {
    const consumer = await authRepository.findByEmailForAuth(email);

    if (!consumer) {
      log.info({ email }, "Forgot-password para e-mail inexistente (resposta uniforme)");
      return;
    }

    // Garante 1 token válido por vez: invalida os anteriores.
    await passwordResetRepository.invalidateActiveForConsumer(consumer.id);

    const rawToken = randomBytes(32).toString("hex");
    const token_hash = hashToken(rawToken);
    const expires_at = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

    await passwordResetRepository.create({ consumer_id: consumer.id, token_hash, expires_at });

    // Envio fire-and-forget: NÃO aguardamos aqui. Isso elimina a diferença de
    // tempo de resposta entre e-mail existente (que enviaria) e inexistente
    // (que retorna cedo), fechando a brecha de enumeração por timing.
    void sendMail({
      to: consumer.email,
      subject: "Redefinição de senha — Xuá Delivery",
      html: resetEmailHtml(consumer.name, buildResetLink(rawToken)),
    }).catch((err) => {
      log.error({ err, consumerId: consumer.id }, "Falha ao enviar e-mail de reset");
    });

    log.info({ consumerId: consumer.id }, "Token de reset gerado");
  },

  /**
   * Efetiva a nova senha a partir de um token válido (não usado, não expirado).
   * Atualiza a senha e marca o token como usado atomicamente.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const token_hash = hashToken(token);
    const record = await passwordResetRepository.findByHash(token_hash);

    if (!record || record.used_at !== null || record.expires_at < new Date()) {
      throw new AuthServiceError("Token inválido ou expirado", 400);
    }

    const password_hash = await hashPassword(newPassword);
    const changedAt = new Date();
    const prisma = getPrisma();

    await prisma.$transaction(async (tx) => {
      // Consumo atômico do token: o UPDATE condicional (used_at IS NULL e não
      // expirado) garante que apenas UM request concorrente vença a corrida.
      const claim = await tx.passwordResetToken.updateMany({
        where: { id: record.id, used_at: null, expires_at: { gt: changedAt } },
        data: { used_at: changedAt },
      });
      if (claim.count === 0) {
        throw new AuthServiceError("Token inválido ou expirado", 400);
      }

      await tx.consumer.update({
        where: { id: record.consumer_id },
        data: { password_hash },
      });
    });

    // Invalida todas as sessões JWT emitidas antes desta troca (SEC): se a conta
    // foi comprometida, redefinir a senha derruba o atacante no próximo request.
    await markPasswordChanged(record.consumer_id, changedAt.getTime());

    log.info({ consumerId: record.consumer_id }, "Senha redefinida via token");
  },
};
