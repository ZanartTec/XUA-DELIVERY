"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/src/schemas/auth";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { FormField } from "@/src/components/shared/form-field";
import { AuthShell } from "@/src/components/auth/auth-shell";

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), mode: "onTouched" });

  async function onSubmit(data: ForgotPasswordInput) {
    setServerError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setServerError(body.error || "Não foi possível enviar. Tente novamente.");
        return;
      }
      // Resposta uniforme: sempre sucesso, mesmo se o e-mail não existir.
      setSentTo(data.email);
    } catch {
      setServerError("Sem conexão. Verifique a internet e tente de novo.");
    }
  }

  if (sentTo) {
    return (
      <AuthShell title="Verifique seu e-mail">
        <div className="grid gap-4 text-center">
          <MailCheck className="mx-auto size-12 text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Se <strong className="text-foreground">{sentTo}</strong> estiver cadastrado, enviamos um link para criar uma nova
            senha. Ele vale por 30 minutos. Confira também a caixa de spam.
          </p>
          <Button asChild variant="cta" size="xl">
            <Link href="/login">Voltar para o login</Link>
          </Button>
          <Button variant="link" onClick={() => setSentTo(null)}>
            Usar outro e-mail
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Esqueceu a senha?"
      description="Informe seu e-mail e enviaremos um link para criar uma nova."
      footer={
        <>
          Lembrou?{" "}
          <Link href="/login" className="font-semibold text-primary">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        {serverError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}
        <FormField label="E-mail" error={errors.email?.message}>
          {(field) => (
            <Input
              {...field}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="nome@exemplo.com"
              className="h-11 rounded-xl"
              {...register("email")}
            />
          )}
        </FormField>
        <Button type="submit" variant="cta" size="xl" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {isSubmitting ? "Enviando…" : "Enviar link"}
          {!isSubmitting ? <ArrowRight aria-hidden /> : null}
        </Button>
      </form>
    </AuthShell>
  );
}
