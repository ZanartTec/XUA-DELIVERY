import pino from "pino";

const isDev = (process.env.NODE_ENV ?? "development") !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  base: {
    service: "xua-api",
    env: process.env.NODE_ENV ?? "development",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
        singleLine: false,
      },
    },
  }),
});

export type Logger = typeof logger;

/**
 * Cria um child logger com contexto de serviço.
 * Exemplo: `const log = createLogger('auth');`
 */
export function createLogger(service: string) {
  return logger.child({ service });
}
