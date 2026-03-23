import { z } from "zod";

export const zoneSchema = z.object({
  name: z.string().min(2, "Nome deve ter ao menos 2 caracteres"),
  distributor_id: z.string().uuid("Distribuidor inválido"),
  is_active: z.boolean().default(true),
});
export type ZoneInput = z.infer<typeof zoneSchema>;

export const coverageSchema = z.object({
  neighborhood: z.string().min(2, "Bairro deve ter ao menos 2 caracteres"),
  zip_code: z.string().regex(/^\d{5}$/, "CEP deve ter 5 dígitos"),
});
export type CoverageInput = z.infer<typeof coverageSchema>;

export const capacityConfigSchema = z.object({
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
  window: z.enum(["morning", "afternoon"]),
  max_orders: z.number().int().min(1, "Mínimo 1 pedido"),
});
export type CapacityConfigInput = z.infer<typeof capacityConfigSchema>;
