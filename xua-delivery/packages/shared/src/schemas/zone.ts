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
