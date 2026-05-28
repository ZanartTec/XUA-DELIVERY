CREATE INDEX IF NOT EXISTS "idx_payments_order_provider_created"
  ON "13_trn_payments" ("order_id", "provider", "created_at");

CREATE INDEX IF NOT EXISTS "idx_payments_sub_provider_created"
  ON "13_trn_payments" ("user_subscription_id", "provider", "created_at");

CREATE INDEX IF NOT EXISTS "idx_payments_provider_payment_ref"
  ON "13_trn_payments" ("provider", "provider_payment_ref");

CREATE INDEX IF NOT EXISTS "idx_payments_idempotency_key"
  ON "13_trn_payments" ("idempotency_key");
