import { loadEnv, EnvValidationError } from "../config/env";
import { createLogger } from "../infra/logger";

/**
 * Entrypoint do worker. Mesma estratégia do server (ver src/server/index.ts):
 * valida o ambiente inteiro antes de importar qualquer módulo que leia env no
 * topo, e só então carrega o bootstrap das filas.
 */
const log = createLogger("worker");

try {
  const { env, warnings } = loadEnv();
  for (const warning of warnings) log.warn({ env: env.NODE_ENV }, warning);
  log.info({ env: env.NODE_ENV }, "Environment validated");
} catch (err) {
  if (err instanceof EnvValidationError) {
    log.fatal({ issues: err.issues }, err.message);
  } else {
    log.fatal({ err }, "Failed to validate environment");
  }
  process.exit(1);
}

void import("./bootstrap").then(({ startWorker }) => startWorker());
