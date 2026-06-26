import type { Application } from "express";
import authRoutes from "../modules/auth/routes/auth.routes.js";
import { ordersRoutes } from "../modules/orders/index.js";
import { driverRoutes } from "../modules/driver/index.js";
import { consumersRoutes } from "../modules/consumers/index.js";
import { productsRoutes } from "../modules/products/index.js";
import { paymentsRoutes } from "../modules/payments/index.js";
import { zonesRoutes } from "../modules/zones/index.js";
import { opsRoutes } from "../modules/ops/index.js";
import { notificationsRoutes } from "../modules/notifications/index.js";
import { distributorRoutes } from "../modules/distributor/routes/distributor.routes.js";
import { distributorsPublicRoutes } from "../modules/distributor/routes/distributors-public.routes.js";
import { bannersRoutes } from "../modules/banners/index.js";
import { subscriptionPlansRoutes } from "../modules/subscription-plans/index.js";
import { userSubscriptionsRoutes } from "../modules/user-subscriptions/index.js";
import { categoriesRoutes } from "../modules/categories/index.js";

// Rotas de negócio registradas progressivamente nos PRs seguintes:
// PR 05 → auth ✓
// PR 06 → orders, driver (OTP) ✓
// PR 07 → consumers, products, payments ✓
// PR 08 → zones, ops (kpis, reconciliations, audit) ✓
// PR 09 → notifications ✓
// PR 10 → internal jobs ✓
// PR 11 → distributor (kpis, capacity) ✓
export function registerRoutes(app: Application): void {
  app.use("/api/auth", authRoutes);
  app.use("/api/orders", ordersRoutes);
  app.use("/api/driver", driverRoutes);
  app.use("/api/consumers", consumersRoutes);
  app.use("/api/products", productsRoutes);
  app.use("/api/payments", paymentsRoutes);
  app.use("/api/zones", zonesRoutes);
  app.use("/api/ops", opsRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api/distributor", distributorRoutes);
  app.use("/api/distributors", distributorsPublicRoutes);
  app.use("/api/banners", bannersRoutes);
  app.use("/api/subscription-plans", subscriptionPlansRoutes);
  app.use("/api/user-subscriptions", userSubscriptionsRoutes);
  app.use("/api/categories", categoriesRoutes);
}
