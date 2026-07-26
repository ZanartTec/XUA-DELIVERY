-- Campo livre preenchido pelo consumidor no checkout ("Instruções Especiais").
-- Antes desta migration o texto era capturado no front (Zustand) e nunca persistido.
ALTER TABLE "09_trn_orders" ADD COLUMN "delivery_instructions" TEXT;
