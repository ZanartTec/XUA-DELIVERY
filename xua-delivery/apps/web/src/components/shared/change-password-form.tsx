"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { changePasswordSchema } from "@/src/schemas/auth";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { FormField } from "@/src/components/shared/form-field";
import { PasswordInput } from "@/src/components/shared/password-input";
import { logout } from "@/src/components/shared/logout-button";
import { ApiError, api } from "@/src/lib/api-client";

const formSchema = changePasswordSchema
  .and(z.object({ confirm: z.string() }))
  .refine((d) => d.new_password === d.confirm, { message: "As senhas não coincidem", path: ["confirm"] });
type FormInput = z.infer<typeof formSchema>;

/**
 * Troca de senha estando logado (todos os papéis). A API invalida as sessões
 * abertas ao trocar, então em seguida a pessoa entra de novo com a senha nova.
 */
export function ChangePasswordForm({ formId = "change-password" }: { formId?: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(formSchema), mode: "onTouched" });

  async function onSubmit(data: FormInput) {
    setServerError(null);
    try {
      await api.post("/api/auth/change-password", {
        current_password: data.current_password,
        new_password: data.new_password,
      });
      toast.success("Senha alterada. Entre de novo com a nova senha.");
      setTimeout(() => void logout(), 1200);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Não foi possível alterar a senha.");
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
      {serverError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}
      <FormField label="Senha atual" error={errors.current_password?.message}>
        {(field) => (
          <PasswordInput {...field} autoComplete="current-password" className="h-11 rounded-xl" {...register("current_password")} />
        )}
      </FormField>
      <FormField label="Nova senha" hint="Mínimo de 8 caracteres." error={errors.new_password?.message}>
        {(field) => (
          <PasswordInput {...field} autoComplete="new-password" className="h-11 rounded-xl" {...register("new_password")} />
        )}
      </FormField>
      <FormField label="Confirme a nova senha" error={errors.confirm?.message}>
        {(field) => <PasswordInput {...field} autoComplete="new-password" className="h-11 rounded-xl" {...register("confirm")} />}
      </FormField>
      <Button type="submit" variant="cta" size="xl" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {isSubmitting ? "Salvando…" : "Alterar senha"}
      </Button>
    </form>
  );
}
