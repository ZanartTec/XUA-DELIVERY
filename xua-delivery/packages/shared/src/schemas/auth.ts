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

// ─── Esqueci a senha (password reset) ──────────────────────────

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, "E-mail obrigatório").email("E-mail inválido"),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, "Token obrigatório"),
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres").max(64, "Senha excessivamente longa"),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ─── Trocar a senha estando logado ─────────────────────────────
// Diferente do reset por e-mail: aqui o usuário já está autenticado e prova
// que sabe a senha atual. Vale para todos os papéis — até esta rota existir,
// a única forma de trocar a senha era o fluxo de "esqueci minha senha".

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Senha atual obrigatória"),
    new_password: z
      .string()
      .min(8, "Senha deve ter ao menos 8 caracteres")
      .max(64, "Senha excessivamente longa"),
  })
  .refine((data) => data.current_password !== data.new_password, {
    message: "A nova senha deve ser diferente da atual",
    path: ["new_password"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
