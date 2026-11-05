-- Regra de vasilhame na entrega: tipos de movimento próprios para a venda do
-- vasilhame na porta e para a água devolvida na entrega parcial.
ALTER TYPE "inventory_movement_type" ADD VALUE IF NOT EXISTS 'BOTTLE_SALE_OUT';
ALTER TYPE "inventory_movement_type" ADD VALUE IF NOT EXISTS 'PARTIAL_DELIVERY_RETURN';
