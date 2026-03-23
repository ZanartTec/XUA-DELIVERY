import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
  base: {
    service: "xua-delivery",
    env: process.env.NODE_ENV,
  },
});

export function childLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
