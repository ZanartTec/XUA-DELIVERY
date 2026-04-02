import express, { type Application } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { healthHandler } from "../server/health";
import { readinessHandler } from "../server/readiness";
import { registerRoutes } from "./routes";
import { errorHandler } from "../middleware/error-handler";

export function createApp(): Application {
  const app = express();

  // ── Segurança e parsing ──────────────────────────────────────────
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.APP_ORIGIN ?? "http://localhost:3000",
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json());

  // ── Probes de infraestrutura (não passam pelo RBAC) ─────────────
  app.get("/health", healthHandler);
  app.get("/readiness", readinessHandler);

  // ── Rotas de negócio (adicionadas progressivamente) ─────────────
  registerRoutes(app);

  // ── Error handler (deve ser o último middleware) ─────────────────
  app.use(errorHandler);

  return app;
}
