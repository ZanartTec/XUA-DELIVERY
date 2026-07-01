-- CreateTable
CREATE TABLE "38_sec_password_reset_tokens" (
    "id" UUID NOT NULL,
    "consumer_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "38_sec_password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "38_sec_password_reset_tokens_token_hash_key" ON "38_sec_password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "38_sec_password_reset_tokens_consumer_id_idx" ON "38_sec_password_reset_tokens"("consumer_id");

-- AddForeignKey
ALTER TABLE "38_sec_password_reset_tokens" ADD CONSTRAINT "38_sec_password_reset_tokens_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "01_mst_consumers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
