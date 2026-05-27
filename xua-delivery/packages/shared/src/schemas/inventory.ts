import { z } from "zod";
import { INVENTORY_ITEM_TYPE_VALUES } from "../enums";

const UUID = z.string().uuid("ID inválido");
const CODE = z
  .string()
  .trim()
  .min(2, "Código deve ter ao menos 2 caracteres")
  .max(60, "Código deve ter no máximo 60 caracteres")
  .regex(/^[A-Za-z0-9_-]+$/, "Código deve conter apenas letras, números, _ ou -")
  .transform((value) => value.toUpperCase());
const NAME = z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres").max(120);
const UNIT_LABEL = z.string().trim().min(1, "Unidade é obrigatória").max(30);
const LOW_STOCK_THRESHOLD = z.number().int().min(0, "Limite mínimo não pode ser negativo");
const BOOLEAN_QUERY = z.enum(["true", "false"]).transform((value) => value === "true");

export const inventoryItemTypeSchema = z.enum(INVENTORY_ITEM_TYPE_VALUES);
export type InventoryItemTypeInput = z.infer<typeof inventoryItemTypeSchema>;

export const inventoryItemCreateSchema = z.object({
  code: CODE,
  name: NAME,
  type: inventoryItemTypeSchema,
  product_id: UUID.optional(),
  unit_label: UNIT_LABEL,
  low_stock_threshold: LOW_STOCK_THRESHOLD.optional(),
  is_active: z.boolean().optional(),
});
export type InventoryItemCreateInput = z.infer<typeof inventoryItemCreateSchema>;

export const inventoryItemUpdateSchema = z
  .object({
    code: CODE.optional(),
    name: NAME.optional(),
    type: inventoryItemTypeSchema.optional(),
    product_id: UUID.nullish(),
    unit_label: UNIT_LABEL.optional(),
    low_stock_threshold: LOW_STOCK_THRESHOLD.nullish(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe ao menos um campo para atualizar",
  });
export type InventoryItemUpdateInput = z.infer<typeof inventoryItemUpdateSchema>;

export const inventoryItemFilterSchema = z.object({
  code: CODE.optional(),
  name: z.string().trim().min(1, "Nome inválido").max(120).optional(),
  type: inventoryItemTypeSchema.optional(),
  product_id: UUID.optional(),
  is_active: BOOLEAN_QUERY.optional(),
});
export type InventoryItemFilterInput = z.infer<typeof inventoryItemFilterSchema>;