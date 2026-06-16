import type { DistributorPaymentSettings } from "@prisma/client";
import type {
  DistributorPaymentMethodsPublic,
  DistributorPaymentSettingsUpdateInput,
  DistributorPaymentSettingsView,
} from "@xua/shared/schemas/distributor-payment-settings";
import { decryptSecret, encryptSecret, maskSecret } from "../../infra/crypto/secret-cipher.js";
import { distributorGatewayRepository } from "./distributor-gateway.repository.js";

export class DistributorGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "DistributorGatewayError";
  }
}

/** Credenciais EM CLARO do gateway de uma distribuidora (uso interno apenas). */
export interface DistributorGatewayCredentials {
  accessToken: string;
  webhookSecret: string;
  publicKey: string | null;
}

function hasGateway(settings: DistributorPaymentSettings | null): boolean {
  return Boolean(settings?.mp_access_token_enc && settings?.mp_webhook_secret_enc);
}

function toPublicMethods(settings: DistributorPaymentSettings): DistributorPaymentMethodsPublic {
  return {
    accepts_pix_online: settings.accepts_pix_online,
    accepts_credit_online: settings.accepts_credit_online,
    accepts_cash_on_delivery: settings.accepts_cash_on_delivery,
    accepts_card_on_delivery: settings.accepts_card_on_delivery,
    mp_connected: hasGateway(settings),
  };
}

export const distributorGatewayService = {
  /**
   * Credenciais decifradas da distribuidora. Retorna null quando não há config
   * ou o gateway MP não está configurado (sem token/secret).
   * USO INTERNO — nunca exponha o retorno em respostas HTTP.
   */
  async getDecryptedCredentials(
    distributorId: string
  ): Promise<DistributorGatewayCredentials | null> {
    const settings = await distributorGatewayRepository.findByDistributorId(distributorId);
    if (!settings || !hasGateway(settings)) return null;
    return {
      accessToken: decryptSecret(settings.mp_access_token_enc!),
      webhookSecret: decryptSecret(settings.mp_webhook_secret_enc!),
      publicKey: settings.mp_public_key,
    };
  },

  /** true se a distribuidora tem gateway MP configurado (token + webhook secret). */
  async hasGateway(distributorId: string): Promise<boolean> {
    const settings = await distributorGatewayRepository.findByDistributorId(distributorId);
    return hasGateway(settings);
  },

  /** Dentre os ids, retorna os que NÃO têm gateway MP configurado. */
  async findMissingGatewayIds(distributorIds: string[]): Promise<string[]> {
    const configured = await distributorGatewayRepository.findConfiguredDistributorIds(distributorIds);
    return distributorIds.filter((id) => !configured.has(id));
  },

  /** Apenas o webhook secret decifrado (validação de assinatura inbound). */
  async getWebhookSecret(distributorId: string): Promise<string | null> {
    const settings = await distributorGatewayRepository.findByDistributorId(distributorId);
    if (!settings?.mp_webhook_secret_enc) return null;
    return decryptSecret(settings.mp_webhook_secret_enc);
  },

  /** Capacidades públicas (sem segredos) para o checkout. Null se não há config. */
  async getPublicMethods(distributorId: string): Promise<DistributorPaymentMethodsPublic | null> {
    const settings = await distributorGatewayRepository.findByDistributorId(distributorId);
    return settings ? toPublicMethods(settings) : null;
  },

  /** Visão administrativa: flags + máscara do token (nunca o token em claro). */
  async getAdminView(distributorId: string): Promise<DistributorPaymentSettingsView | null> {
    const settings = await distributorGatewayRepository.findByDistributorId(distributorId);
    if (!settings) return null;
    const accessToken = settings.mp_access_token_enc
      ? decryptSecret(settings.mp_access_token_enc)
      : null;
    return {
      ...toPublicMethods(settings),
      provider: settings.provider,
      mp_access_token_masked: maskSecret(accessToken),
      mp_public_key: settings.mp_public_key,
    };
  },

  /**
   * Cria/atualiza a config de pagamento da distribuidora. Cifra credenciais
   * novas; mantém as armazenadas quando ausentes. Regra: se algum método online
   * (Pix/Cartão) estiver ligado, precisa ter access token + webhook secret
   * (novos ou já persistidos).
   */
  async updateSettings(
    distributorId: string,
    input: DistributorPaymentSettingsUpdateInput
  ): Promise<DistributorPaymentSettingsView> {
    const existing = await distributorGatewayRepository.findByDistributorId(distributorId);

    const accessTokenEnc = input.mp_access_token
      ? encryptSecret(input.mp_access_token)
      : (existing?.mp_access_token_enc ?? null);
    const webhookSecretEnc = input.mp_webhook_secret
      ? encryptSecret(input.mp_webhook_secret)
      : (existing?.mp_webhook_secret_enc ?? null);
    const publicKey =
      input.mp_public_key === undefined
        ? (existing?.mp_public_key ?? null)
        : input.mp_public_key;

    const wantsOnline = input.accepts_pix_online || input.accepts_credit_online;
    if (wantsOnline && (!accessTokenEnc || !webhookSecretEnc)) {
      throw new DistributorGatewayError(
        "GATEWAY_REQUIRED",
        "Para aceitar Pix ou cartão no app é preciso cadastrar o access token e o webhook secret do Mercado Pago."
      );
    }

    await distributorGatewayRepository.upsert(distributorId, {
      distributor_id: distributorId,
      accepts_pix_online: input.accepts_pix_online,
      accepts_credit_online: input.accepts_credit_online,
      accepts_cash_on_delivery: input.accepts_cash_on_delivery,
      accepts_card_on_delivery: input.accepts_card_on_delivery,
      mp_access_token_enc: accessTokenEnc,
      mp_webhook_secret_enc: webhookSecretEnc,
      mp_public_key: publicKey,
    });

    const view = await this.getAdminView(distributorId);
    if (!view) {
      throw new DistributorGatewayError("UPDATE_FAILED", "Falha ao salvar configuração de pagamento");
    }
    return view;
  },
};
