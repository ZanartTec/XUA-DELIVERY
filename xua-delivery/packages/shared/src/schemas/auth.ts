import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().min(1, "E-mail obrigatório").email("E-mail inválido"),
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres").max(64, "Senha excessivamente longa"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres"),
  email: z.string().trim().min(1, "E-mail obrigatório").email("E-mail inválido"),
  // FUNC-04: Telefone obrigatório para OTP por SMS
  phone: z.string().trim().min(8, "Telefone inválido"),
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres").max(64, "Senha excessivamente longa"),
});
export type RegisterInput = z.infer<typeof registerSchema>;
