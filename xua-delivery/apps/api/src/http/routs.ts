import type { Application } from "express";
import authRoutes from "../modules/auth/routes/auth.routes.js";
import { ordersRoutes } from "../modules/orders/index.js";
import { driverRoutes } from "../modules/driver/index.js";
import { consumersRoutes } from "../modules/consumers/index.js";
import { subscriptionsRoutes } from "../modules/subscriptions/index.js";
import { productsRoutes } from "../modules/products/index.js";
import { paymentsRoutes } from "../modules/payments/index.js";
import { zonesRoutes } from "../modules/zones/index.js";
import { opsRoutes } from "../modules/ops/index.js";
import { notificationsRoutes } from "../modules/notifications/index.js";
import { jobsRoutes } from "../jobs/index.js";

// Rotas de negócio registradas progressivamente nos PRs seguintes:
// PR 05 → auth ✓
// PR 06 → orders, driver (OTP) ✓
// PR 07 → consumers, subscriptions, products, payments ✓
// PR 08 → zones, ops (kpis, reconciliations, audit) ✓
// PR 09 → notifications ✓
// PR 10 → internal jobs ✓
export function registerRoutes(app: Application): void {
  // Jobs internos (protegidos por INTERNAL_JOB_SECRET, não por JWT)
  app.use("/api/internal/jobs", jobsRoutes);

  app.use("/api/auth", authRoutes);
  app.use("/api/orders", ordersRoutes);
  app.use("/api/driver", driverRoutes);
  app.use("/api/consumers", consumersRoutes);
  app.use("/api/subscriptions", subscriptionsRoutes);
  app.use("/api/products", productsRoutes);
  app.use("/api/payments", paymentsRoutes);
  app.use("/api/zones", zonesRoutes);
  app.use("/api/ops", opsRoutes);
  app.use("/api/notifications", notificationsRoutes);
}
