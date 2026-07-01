import { Resend } from "resend";
import { createLogger } from "../logger/index.js";

const log = createLogger("mailer");

// Provedor isolado atrás de sendMail(): trocar Resend por outro provedor
// (SendGrid, SMTP, etc.) afeta apenas este arquivo.
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Remetente. Com domínio verificado no Resend, use "Xuá <no-reply@seudominio.com>".
// "onboarding@resend.dev" só entrega para o e-mail dono da conta Resend (modo teste).
const MAIL_FROM = process.env.MAIL_FROM ?? "Xuá Delivery <onboarding@resend.dev>";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

if (!resend && process.env.NODE_ENV === "production") {
  log.error("RESEND_API_KEY ausente em produção — envio de e-mail está DESABILITADO.");
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Envia um e-mail transacional.
 * Sem RESEND_API_KEY, opera em modo dev-stub: não envia, apenas loga o conteúdo
 * (útil para testar o fluxo de reset localmente antes de configurar o provedor).
 */
export async function sendMail({ to, subject, html, text }: SendMailInput): Promise<void> {
  if (!resend) {
    log.warn(
      { to, subject },
      "[DEV MAIL] RESEND_API_KEY ausente — e-mail NÃO enviado. Conteúdo logado abaixo."
    );
    log.info({ to, subject, html }, "[DEV MAIL] conteúdo do e-mail");
    return;
  }

  const { data, error } = await resend.emails.send({
    from: MAIL_FROM,
    to,
    subject,
    html,
    ...(text ? { text } : {}),
  });

  if (error) {
    log.error({ err: error, to, subject }, "Falha ao enviar e-mail via Resend");
    throw new Error(`Falha ao enviar e-mail: ${error.message}`);
  }

  log.info({ to, subject, id: data?.id }, "E-mail enviado via Resend");
}
