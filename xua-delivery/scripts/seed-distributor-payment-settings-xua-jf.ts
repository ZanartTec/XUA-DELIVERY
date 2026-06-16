/**
 * Migração pontual: cria/atualiza a configuração de pagamento da
 * "Distribuidora Xuá JF" usando as credenciais do Mercado Pago que hoje vivem
 * no .env global. A partir disso, ela passa a receber os pagamentos do app.
 *
 * - Habilita os 4 métodos (Pix, Cartão no app, Dinheiro, Cartão na entrega).
 * - Cifra access token + webhook secret (AES-256-GCM) com ENCRYPTION_MASTER_KEY.
 * - Idempotente (upsert por distributor_id).
 *
 * Rodar:
 *   node --env-file=apps/api/.env --import tsx scripts/seed-distributor-payment-settings-xua-jf.ts
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(process.cwd(), "apps/api/.env") });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encryptSecret } from "../apps/api/src/infra/crypto/secret-cipher.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const DISTRIBUTOR_ID = "00000000-0000-4000-a000-000000000010"; // Distribuidora Xuá JF

async function main() {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN ?? process.env.MP_ACCESS_TOKEN;
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET ?? process.env.PAYMENT_WEBHOOK_SECRET;
  if (!accessToken || !webhookSecret) {
    throw new Error(
      "Defina MERCADOPAGO_ACCESS_TOKEN e MERCADOPAGO_WEBHOOK_SECRET no apps/api/.env antes de rodar."
    );
  }
  if (!process.env.ENCRYPTION_MASTER_KEY) {
    throw new Error("ENCRYPTION_MASTER_KEY não definido no apps/api/.env.");
  }

  const distributor = await prisma.distributor.findUnique({
    where: { id: DISTRIBUTOR_ID },
    select: { id: true, name: true },
  });
  if (!distributor) {
    throw new Error(`Distribuidora ${DISTRIBUTOR_ID} (Xuá JF) não encontrada. Rode o seed base antes.`);
  }

  const data = {
    accepts_pix_online: true,
    accepts_credit_online: true,
    accepts_cash_on_delivery: true,
    accepts_card_on_delivery: true,
    provider: "mercadopago",
    mp_access_token_enc: encryptSecret(accessToken),
    mp_webhook_secret_enc: encryptSecret(webhookSecret),
    mp_public_key: process.env.MERCADOPAGO_PUBLIC_KEY ?? null,
  };

  await prisma.distributorPaymentSettings.upsert({
    where: { distributor_id: DISTRIBUTOR_ID },
    create: { distributor_id: DISTRIBUTOR_ID, ...data },
    update: data,
  });

  console.log(`✅ Config de pagamento salva para "${distributor.name}"`);
  console.log("   Métodos    : Pix, Cartão (app), Dinheiro, Cartão na entrega");
  console.log("   Gateway MP : access token + webhook secret cifrados (AES-256-GCM)");
}

main()
  .catch((err) => {
    console.error("❌ Falha na migração de config de pagamento:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
