import { z } from "zod";

export const profileUpdateSchema = z.object({
  name: z.string().min(2, "Nome deve ter ao menos 2 caracteres").optional(),
  phone: z.string().min(8, "Telefone inválido").optional(),
}).refine((data) => data.name || data.phone, {
  message: "Informe ao menos um campo para atualizar",
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const updateAssignModeSchema = z.object({
  auto_assign_distributor: z.boolean(),
});
export type UpdateAssignModeInput = z.infer<typeof updateAssignModeSchema>;
