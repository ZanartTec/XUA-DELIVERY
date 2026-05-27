import { z } from "zod";
import {
  INVENTORY_ITEM_TYPE_VALUES,
  INVENTORY_MOVEMENT_TYPE_VALUES,
  INVENTORY_REFERENCE_TYPE_VALUES,
} from "../enums";

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
const LIMIT_QUERY = z.coerce
  .number()
  .int("limit deve ser inteiro")
  .min(1, "limit deve ser maior que zero")
  .max(100, "limit deve ser no máximo 100")
  .default(50);
const OFFSET_QUERY = z.coerce
  .number()
  .int("offset deve ser inteiro")
  .min(0, "offset não pode ser negativo")
  .default(0);
const PERIOD_BOUNDARY = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Data inválida")
  .optional();
const INITIAL_LOAD_BATCH_VERSION = z
  .string()
  .trim()
  .min(1, "Versão do lote é obrigatória")
  .max(60, "Versão do lote deve ter no máximo 60 caracteres")
  .optional();
const INITIAL_LOAD_OBSERVATION = z
  .string()
  .trim()
  .min(1, "Observação não pode ser vazia")
  .max(500, "Observação deve ter no máximo 500 caracteres")
  .optional();

export const inventoryItemTypeSchema = z.enum(INVENTORY_ITEM_TYPE_VALUES);
export type InventoryItemTypeInput = z.infer<typeof inventoryItemTypeSchema>;

export const inventoryMovementTypeSchema = z.enum(INVENTORY_MOVEMENT_TYPE_VALUES);
export type InventoryMovementTypeInput = z.infer<typeof inventoryMovementTypeSchema>;

export const inventoryReferenceTypeSchema = z.enum(INVENTORY_REFERENCE_TYPE_VALUES);
export type InventoryReferenceTypeInput = z.infer<typeof inventoryReferenceTypeSchema>;

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

export const inventoryBalanceQuerySchema = z
  .object({
    inventory_item_id: UUID.optional(),
    limit: LIMIT_QUERY,
    offset: OFFSET_QUERY,
  })
  .strict();
export type InventoryBalanceQueryInput = z.infer<typeof inventoryBalanceQuerySchema>;

export const inventoryMovementQuerySchema = z
  .object({
    inventory_item_id: UUID.optional(),
    movement_type: inventoryMovementTypeSchema.optional(),
    start: PERIOD_BOUNDARY,
    end: PERIOD_BOUNDARY,
    limit: LIMIT_QUERY,
    offset: OFFSET_QUERY,
  })
  .strict()
  .refine(
    (data) => {
      if (!data.start || !data.end) return true;
      return Date.parse(data.start) <= Date.parse(data.end);
    },
    { message: "start deve ser anterior ou igual a end", path: ["end"] }
  );
export type InventoryMovementQueryInput = z.infer<typeof inventoryMovementQuerySchema>;

export const inventoryInitialLoadSchema = z
  .object({
    batch_id: UUID,
    batch_version: INITIAL_LOAD_BATCH_VERSION,
    observation: INITIAL_LOAD_OBSERVATION,
    items: z
      .array(
        z
          .object({
            inventory_item_id: UUID,
            quantity: z
              .number()
              .int("Quantidade deve ser um inteiro")
              .min(0, "Quantidade não pode ser negativa"),
          })
          .strict()
      )
      .min(1, "Informe ao menos um item")
      .max(100, "Carga inicial deve ter no máximo 100 itens"),
  })
  .strict()
  .superRefine((data, ctx) => {
    const seen = new Set<string>();

    data.items.forEach((item, index) => {
      if (seen.has(item.inventory_item_id)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "inventory_item_id"],
          message: "Item duplicado na carga inicial",
        });
        return;
      }

      seen.add(item.inventory_item_id);
    });
  });
export type InventoryInitialLoadInput = z.infer<typeof inventoryInitialLoadSchema>;