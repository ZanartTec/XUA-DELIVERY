"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Loader2 } from "lucide-react";
import { loginSchema, type LoginInput } from "@/src/schemas/auth";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { FormField } from "@/src/components/shared/form-field";
import { PasswordInput } from "@/src/components/shared/password-input";
import { AuthShell } from "@/src/components/auth/auth-shell";

export default function LoginPage() {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), mode: "onTouched" });

  async function onSubmit(data: LoginInput) {
    setServerError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setServerError(body.error || "E-mail ou senha incorretos.");
        return;
      }
      window.location.replace("/");
    } catch {
      setServerError("Sem conexão. Verifique a internet e tente de novo.");
    }
  }

  return (
    <AuthShell
      title="Entrar"
      description="Acesse sua conta para pedir e acompanhar entregas."
      footer={
        <>
          Novo no Xuá?{" "}
          <Link href="/register" className="font-semibold text-primary">
            Criar conta
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

        <FormField label="Senha" error={errors.password?.message}>
          {(field) => (
            <PasswordInput
              {...field}
              autoComplete="current-password"
              placeholder="Sua senha"
              className="h-11 rounded-xl"
              {...register("password")}
            />
          )}
        </FormField>

        <Link href="/forgot-password" className="-mt-2 justify-self-end text-sm font-semibold text-primary">
          Esqueci minha senha
        </Link>

        <Button type="submit" variant="cta" size="xl" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {isSubmitting ? "Entrando…" : "Entrar"}
          {!isSubmitting ? <ArrowRight aria-hidden /> : null}
        </Button>
      </form>
    </AuthShell>
  );
}
