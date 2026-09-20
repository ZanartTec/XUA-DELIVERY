import { loadEnv, EnvValidationError } from "../config/env";
import { logger } from "../infra/logger";

/**
 * Entrypoint da API.
 *
 * Só faz duas coisas, nesta ordem: valida o ambiente e, se estiver íntegro,
 * carrega o bootstrap. O import do bootstrap é dinâmico de propósito — imports
 * estáticos são içados e executariam os módulos de infra (que validam suas
 * próprias envs no topo do arquivo) antes desta validação, devolvendo só o
 * primeiro erro em vez da lista completa.
 */
try {
  const { env, warnings } = loadEnv();
  for (const warning of warnings) logger.warn({ env: env.NODE_ENV }, warning);
  logger.info({ env: env.NODE_ENV }, "Environment validated");
} catch (err) {
  if (err instanceof EnvValidationError) {
    logger.fatal({ issues: err.issues }, err.message);
  } else {
    logger.fatal({ err }, "Failed to validate environment");
  }
  process.exit(1);
}

void import("./bootstrap").then(({ startServer }) => startServer());
