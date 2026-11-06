"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Loader2, LinkIcon } from "lucide-react";
import { resetPasswordSchema } from "@/src/schemas/auth";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { FormField } from "@/src/components/shared/form-field";
import { PasswordInput } from "@/src/components/shared/password-input";
import { AuthShell } from "@/src/components/auth/auth-shell";

// Estende o schema compartilhado com confirmação de senha (validação só no cliente).
const formSchema = resetPasswordSchema
  .pick({ password: true })
  .extend({ confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: "As senhas não coincidem", path: ["confirm"] });

type FormInput = z.infer<typeof formSchema>;

function ResetPasswordContent() {
  const token = useSearchParams().get("token") ?? "";
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(formSchema), mode: "onTouched" });

  async function onSubmit(data: FormInput) {
    setServerError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: data.password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setServerError(body.error || "Não foi possível redefinir a senha.");
        return;
      }
      setDone(true);
    } catch {
      setServerError("Sem conexão. Verifique a internet e tente de novo.");
    }
  }

  if (!token) {
    return (
      <AuthShell title="Link inválido" description="Este link de redefinição está incompleto ou já expirou.">
        <div className="grid gap-4 text-center">
          <LinkIcon className="mx-auto size-10 text-muted-foreground" aria-hidden />
          <Button asChild variant="cta" size="xl">
            <Link href="/forgot-password">Pedir novo link</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Senha redefinida">
        <div className="grid gap-4 text-center">
          <CheckCircle2 className="mx-auto size-12 text-success-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">Pronto! Use a nova senha para entrar.</p>
          <Button asChild variant="cta" size="xl">
            <Link href="/login">Ir para o login</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Criar nova senha" description="Mínimo de 8 caracteres.">
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        {serverError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}
        <FormField label="Nova senha" error={errors.password?.message}>
          {(field) => (
            <PasswordInput {...field} autoComplete="new-password" className="h-11 rounded-xl" {...register("password")} />
          )}
        </FormField>
        <FormField label="Confirme a nova senha" error={errors.confirm?.message}>
          {(field) => (
            <PasswordInput {...field} autoComplete="new-password" className="h-11 rounded-xl" {...register("confirm")} />
          )}
        </FormField>
        <Button type="submit" variant="cta" size="xl" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {isSubmitting ? "Salvando…" : "Salvar nova senha"}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
