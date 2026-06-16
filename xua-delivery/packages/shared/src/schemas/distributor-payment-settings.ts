import { z } from "zod";

/**
 * Configuração de pagamento por distribuidora: quais métodos ela aceita e,
 * para os métodos online (Pix/Cartão via Mercado Pago), as credenciais do
 * gateway dela. As credenciais são opcionais no payload — se ausentes, o
 * valor já armazenado é mantido. A regra "método online exige gateway" é
 * validada no service, considerando credenciais novas + já persistidas.
 *
 * IMPORTANTE: segredos (access token / webhook secret) NUNCA voltam em leitura;
 * o GET retorna apenas máscara + flags de conexão.
 */
export const distributorPaymentSettingsUpdateSchema = z.object({
  accepts_pix_online: z.boolean(),
  accepts_credit_online: z.boolean(),
  accepts_cash_on_delivery: z.boolean(),
  accepts_card_on_delivery: z.boolean(),
  mp_access_token: z.string().trim().min(1, "Access token inválido").optional(),
  mp_webhook_secret: z.string().trim().min(1, "Webhook secret inválido").optional(),
  mp_public_key: z.string().trim().min(1, "Public key inválida").optional().nullable(),
});
export type DistributorPaymentSettingsUpdateInput = z.infer<
  typeof distributorPaymentSettingsUpdateSchema
>;

/** Capacidades públicas (sem segredos) consumidas pelo checkout. */
export type DistributorPaymentMethodsPublic = {
  accepts_pix_online: boolean;
  accepts_credit_online: boolean;
  accepts_cash_on_delivery: boolean;
  accepts_card_on_delivery: boolean;
  /** true quando há gateway MP configurado (token + webhook secret). */
  mp_connected: boolean;
};

/** Visão administrativa: flags + máscara do token (nunca o token em claro). */
export type DistributorPaymentSettingsView = DistributorPaymentMethodsPublic & {
  provider: string;
  mp_access_token_masked: string | null;
  mp_public_key: string | null;
};
