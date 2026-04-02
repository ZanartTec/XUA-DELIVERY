import type { Application } from "express";

// Rotas de negócio registradas progressivamente nos PRs seguintes:
// PR 05 → auth
// PR 06 → orders, driver (OTP)
// PR 07 → consumers, subscriptions, products, payments
// PR 08 → zones, distributor, audit
// PR 09 → notifications
export function registerRoutes(_app: Application): void {
  // placeholder
}
