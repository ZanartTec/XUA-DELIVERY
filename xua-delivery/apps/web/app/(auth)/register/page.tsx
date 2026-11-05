"use client";

import { useState } from "react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Loader2 } from "lucide-react";
import { registerSchema, type RegisterInput } from "@/src/schemas/auth";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { FormField } from "@/src/components/shared/form-field";
import { MaskedInput } from "@/src/components/shared/masked-input";
import { PasswordInput } from "@/src/components/shared/password-input";
import { AuthShell } from "@/src/components/auth/auth-shell";
import { formatPhone } from "@/src/lib/format";

/** Força simples só para orientar (a regra real continua sendo mínimo de 8). */
function passwordHint(pw: string): { label: string; tone: string } | null {
  if (!pw) return null;
  if (pw.length < 8) return { label: `Faltam ${8 - pw.length} caracteres`, tone: "text-muted-foreground" };
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length >= 12 && variety >= 3) return { label: "Senha forte", tone: "text-success-foreground" };
  if (variety >= 2) return { label: "Senha boa", tone: "text-success-foreground" };
  return { label: "Senha fraca: misture letras e números", tone: "text-warning-foreground" };
}

export default function RegisterPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    // Valida ao sair do campo: a mensagem não fica gritando enquanto a pessoa digita.
    mode: "onTouched",
    defaultValues: { name: "", email: "", phone: "", password: "" },
  });
  const hint = passwordHint(watch("password"));

  async function onSubmit(data: RegisterInput) {
    setServerError(null);
    setEmailTaken(false);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, phone: formatPhone(data.phone) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setEmailTaken(true);
          return;
        }
        setServerError(body.error || "Não foi possível criar a conta.");
        return;
      }
      window.location.replace("/");
    } catch {
      setServerError("Sem conexão. Verifique a internet e tente de novo.");
    }
  }

  return (
    <AuthShell
      title="Criar conta"
      description="Leva menos de um minuto."
      footer={
        <>
          Já tem conta?{" "}
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
        {emailTaken ? (
          <Alert role="alert" className="border-primary/30 bg-secondary">
            <AlertDescription className="text-foreground">
              Este e-mail já tem conta no Xuá.{" "}
              <Link href="/login" className="font-semibold text-primary underline-offset-2 hover:underline">
                Entrar
              </Link>{" "}
              ou{" "}
              <Link href="/forgot-password" className="font-semibold text-primary underline-offset-2 hover:underline">
                recuperar a senha
              </Link>
              .
            </AlertDescription>
          </Alert>
        ) : null}

        <FormField label="Nome completo" error={errors.name?.message}>
          {(field) => (
            <Input {...field} autoComplete="name" placeholder="Como devemos te chamar" className="h-11 rounded-xl" {...register("name")} />
          )}
        </FormField>

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

        <FormField label="Celular" hint="Usado pelo entregador para falar com você." error={errors.phone?.message}>
          {(field) => (
            <Controller
              control={control}
              name="phone"
              render={({ field: f }) => (
                <MaskedInput
                  {...field}
                  mask="phone"
                  value={f.value}
                  onValueChange={f.onChange}
                  onBlur={f.onBlur}
                  name={f.name}
                  placeholder="(00) 00000-0000"
                  className="h-11 rounded-xl"
                />
              )}
            />
          )}
        </FormField>

        <FormField label="Senha" error={errors.password?.message}>
          {(field) => (
            <div className="grid gap-1">
              <PasswordInput
                {...field}
                autoComplete="new-password"
                placeholder="Mínimo de 8 caracteres"
                className="h-11 rounded-xl"
                {...register("password")}
              />
              {hint && !errors.password ? <p className={`text-xs ${hint.tone}`}>{hint.label}</p> : null}
            </div>
          )}
        </FormField>

        <Button type="submit" variant="cta" size="xl" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {isSubmitting ? "Criando conta…" : "Criar conta"}
          {!isSubmitting ? <ArrowRight aria-hidden /> : null}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Ao criar a conta, você concorda com os termos de uso e a política de privacidade do Xuá.
        </p>
      </form>
    </AuthShell>
  );
}
