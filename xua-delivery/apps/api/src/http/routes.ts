import type { Application } from "express";
import authRoutes from "../modules/auth/auth.routes";

// Rotas de negócio registradas progressivamente nos PRs seguintes:
// PR 05 → auth ✓
// PR 06 → orders, driver (OTP)
// PR 07 → consumers, subscriptions, products, payments
// PR 08 → zones, distributor, audit
// PR 09 → notifications
export function registerRoutes(app: Application): void {
  app.use("/api/auth", authRoutes);
}
