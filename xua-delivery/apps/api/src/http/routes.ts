import type { Application } from "express";
import authRoutes from "../modules/auth/auth.routes.js";
import { ordersRoutes } from "../modules/orders/index.js";
import { driverRoutes } from "../modules/driver/index.js";

// Rotas de negócio registradas progressivamente nos PRs seguintes:
// PR 05 → auth ✓
// PR 06 → orders, driver (OTP) ✓
// PR 07 → consumers, subscriptions, products, payments
// PR 08 → zones, distributor, audit
// PR 09 → notifications
export function registerRoutes(app: Application): void {
  app.use("/api/auth", authRoutes);
  app.use("/api/orders", ordersRoutes);
  app.use("/api/driver", driverRoutes);
}
