import { z } from "zod";
import { DELIVERY_WINDOW_INPUT_VALUES } from "../enums";
import { normalizeDocument, isValidCnpj } from "./deposit";

export const distributorQuerySchema = z.object({
  zone_id: z.string().uuid("zone_id inválido"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)").optional(),
  window: z.enum(DELIVERY_WINDOW_INPUT_VALUES).optional(),
});
export type DistributorQueryInput = z.infer<typeof distributorQuerySchema>;

// ─── CRUD de distribuidora (ops) ───────────────────────────────

const cnpjField = z
  .string()
  .trim()
  .min(1, "CNPJ é obrigatório")
  .transform(normalizeDocument)
  .refine(isValidCnpj, "CNPJ inválido");

const distributorEditableFieldsSchema = z.object({
  name: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres"),
  cnpj: cnpjField,
  phone: z.string().trim().min(8, "Telefone inválido"),
  email: z.string().trim().min(1, "E-mail obrigatório").email("E-mail inválido"),
  acceptance_sla_seconds: z.coerce.number().int().positive().optional(),
  allows_consumer_choice: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

/**
 * Criação de distribuidora + primeiro admin (distributor_admin) numa transação única.
 * `is_active` não entra aqui: toda distribuidora nova nasce ativa (default do schema).
 */
export const distributorCreateSchema = distributorEditableFieldsSchema
  .omit({ is_active: true })
  .extend({
    admin_name: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres"),
    admin_email: z.string().trim().min(1, "E-mail obrigatório").email("E-mail inválido"),
    admin_phone: z.string().trim().min(8, "Telefone inválido"),
    admin_password: z
      .string()
      .min(8, "Senha deve ter ao menos 8 caracteres")
      .max(64, "Senha excessivamente longa"),
  });
export type DistributorCreateInput = z.infer<typeof distributorCreateSchema>;

export const distributorUpdateSchema = distributorEditableFieldsSchema.partial();
export type DistributorUpdateInput = z.infer<typeof distributorUpdateSchema>;
