import { z } from "zod";

const NAME = z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres").max(120);
const DESCRIPTION = z.string().trim().max(2000).optional();
const UUID = z.string().uuid("ID inválido");
const QUANTITY = z.number().int("Quantidade deve ser inteira").positive("Quantidade deve ser positiva");
const PRICE_CENTS = z
  .number()
  .int("Preço deve ser inteiro (centavos)")
  .positive("Preço deve ser positivo");
const DISCOUNT_PERCENTAGE = z
  .number()
  .min(0, "Desconto não pode ser negativo")
  .max(100, "Desconto não pode exceder 100");
const DATE_ISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, "Data inválida (YYYY-MM-DD)");
const DISTRIBUTOR_IDS = z
  .array(UUID)
  .min(1, "Informe ao menos um distribuidor");

export const subscriptionPlanCreateSchema = z
  .object({
    name: NAME,
    description: DESCRIPTION,
    product_id: UUID,
    quantity: QUANTITY,
    discount_percentage: DISCOUNT_PERCENTAGE.optional(),
    unit_price_with_discount_cents: PRICE_CENTS,
    valid_from: DATE_ISO,
    valid_until: DATE_ISO,
    distributor_ids: DISTRIBUTOR_IDS,
  })
  .refine((data) => new Date(data.valid_from) <= new Date(data.valid_until), {
    message: "valid_until deve ser posterior ou igual a valid_from",
    path: ["valid_until"],
  });
export type SubscriptionPlanCreateInput = z.infer<typeof subscriptionPlanCreateSchema>;

export const subscriptionPlanUpdateSchema = z
  .object({
    name: NAME.optional(),
    description: DESCRIPTION,
    quantity: QUANTITY.optional(),
    discount_percentage: DISCOUNT_PERCENTAGE.optional(),
    unit_price_with_discount_cents: PRICE_CENTS.optional(),
    valid_from: DATE_ISO.optional(),
    valid_until: DATE_ISO.optional(),
    is_active: z.boolean().optional(),
    distributor_ids: DISTRIBUTOR_IDS.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe ao menos um campo para atualizar",
  })
  .refine(
    (data) =>
      !data.valid_from ||
      !data.valid_until ||
      new Date(data.valid_from) <= new Date(data.valid_until),
    {
      message: "valid_until deve ser posterior ou igual a valid_from",
      path: ["valid_until"],
    }
  );
export type SubscriptionPlanUpdateInput = z.infer<typeof subscriptionPlanUpdateSchema>;
