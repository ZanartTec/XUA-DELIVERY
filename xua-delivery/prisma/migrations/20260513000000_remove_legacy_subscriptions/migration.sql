-- Remove legacy subscription model. Data in these tables is intentionally discarded.
DROP TABLE IF EXISTS "12_piv_subscription_orders";
DROP TABLE IF EXISTS "11_trn_subscriptions";
DROP TYPE IF EXISTS "subscription_status";
