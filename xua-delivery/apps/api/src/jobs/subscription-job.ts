import {
  subscriptionGenerationService,
  type GenerationResult,
} from "../modules/user-subscriptions/services/subscription-generation.service.js";
import { logger } from "../infra/logger/index.js";

/**
 * Job handler: gera os pedidos automáticos das entregas agendadas de assinatura.
 *
 * Disparado pelo BullMQ Job Scheduler `subscription-generation` (00h, 05h e 16h
 * São Paulo) via `internal-jobs.processor`. Atua como rede de segurança / catch-up:
 * a geração também é disparada por evento na ativação do pagamento (Fase 2).
 *
 * A lógica de geração (atômica, idempotente, com reagendamento defensivo e
 * recuperação de pedidos órfãos) vive em `subscriptionGenerationService`.
 */
export async function runSubscriptionJob(): Promise<GenerationResult> {
  const result = await subscriptionGenerationService.generateDueDeliveries();
  logger.info(result, "subscription-job: entregas de assinatura processadas");
  return result;
}
