-- CreateEnum: consumer_role
CREATE TYPE "consumer_role" AS ENUM ('consumer', 'distributor_admin', 'driver', 'support', 'ops');

-- Migrar valores legados antes de converter a coluna
UPDATE "01_mst_consumers" SET role = 'driver' WHERE role = 'operator';

-- Converter coluna de text para enum (constraint real no DB)
ALTER TABLE "01_mst_consumers"
  ALTER COLUMN role TYPE "consumer_role" USING role::"consumer_role",
  ALTER COLUMN role SET DEFAULT 'consumer'::"consumer_role";
