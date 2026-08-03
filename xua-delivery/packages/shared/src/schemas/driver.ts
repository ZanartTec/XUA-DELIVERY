import { z } from "zod";

// ─── CRUD de motorista (distributor_admin, ops) ────────────────

/**
 * `distributor_id` só é obrigatório quando quem cadastra é `ops` (precisa
 * escolher a distribuidora). Quando quem cadastra é `distributor_admin`, o
 * service resolve e ignora qualquer valor enviado no body (isolamento por
 * distribuidora — ver distributorRepository.resolveDistributorId).
 */
export const driverCreateSchema = z.object({
  name: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres"),
  email: z.string().trim().min(1, "E-mail obrigatório").email("E-mail inválido"),
  phone: z.string().trim().min(8, "Telefone inválido").optional(),
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres").max(64, "Senha excessivamente longa"),
  distributor_id: z.string().uuid("Distribuidora inválida").optional(),
});
export type DriverCreateInput = z.infer<typeof driverCreateSchema>;

export const driverUpdateSchema = z
  .object({
    name: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres"),
    phone: z.string().trim().min(8, "Telefone inválido"),
    is_active: z.boolean(),
  })
  .partial();
export type DriverUpdateInput = z.infer<typeof driverUpdateSchema>;
