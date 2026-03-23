-- Trigger: Bloqueia regressão de status em pedidos finalizados (DELIVERED, CANCELLED)
-- Referência: trg_09_trn_orders_status_regression (seção 2.3 do guia técnico)

CREATE OR REPLACE FUNCTION fn_prevent_status_regression()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('DELIVERED', 'CANCELLED') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'STATUS_REGRESSION_BLOCKED: Cannot change status from % to %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_09_trn_orders_status_regression
  BEFORE UPDATE OF status ON "09_trn_orders"
  FOR EACH ROW
  EXECUTE FUNCTION fn_prevent_status_regression();
