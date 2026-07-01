"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/src/schemas/auth";
import { Input } from "@/src/components/ui/input";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

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
      setSent(true);
    } catch {
      setServerError("Erro de conexão. Tente novamente.");
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f8f9fa] px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-transparent.png" alt="Xuá Água Mineral" className="h-20 w-auto" />
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg shadow-black/5">
          {sent ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-[#00E0FF]" />
              <h1 className="mt-3 font-heading text-xl font-extrabold text-[#0d1b2f]">
                Verifique seu e-mail
              </h1>
              <p className="mt-2 text-sm text-[#7d8494]">
                Se o e-mail estiver cadastrado, enviamos um link para redefinir sua senha.
                O link expira em 30 minutos. Não esqueça de olhar a caixa de spam.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#00E0FF] text-base font-semibold text-[#001735] transition-all hover:bg-[#00E0FF]/90 active:scale-[0.98]"
              >
                Voltar para o login
              </Link>
            </div>
          ) : (
            <>
              <h1 className="font-heading text-xl font-extrabold leading-tight text-[#0d1b2f]">
                Esqueceu a senha?
              </h1>
              <p className="mt-0.5 text-sm text-[#7d8494]">
                Informe seu e-mail e enviaremos um link para você criar uma nova senha.
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                {serverError && (
                  <div className="rounded-xl bg-red-50 px-4 py-2.5 text-center text-sm text-red-600">
                    {serverError}
                  </div>
                )}

                <div className="space-y-1">
                  <label
                    htmlFor="email"
                    className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ba3af]"
                  >
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="nome@exemplo.com"
                    className="h-11 rounded-xl border border-[#e8eaf0] bg-white shadow-none focus-visible:border-[#00E0FF] focus-visible:ring-1 focus-visible:ring-[#00E0FF]/60"
                    {...register("email")}
                  />
                  {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#00E0FF] text-base font-semibold text-[#001735] transition-all hover:bg-[#00E0FF]/90 active:scale-[0.98] disabled:opacity-60"
                >
                  {isSubmitting ? "Enviando..." : "Enviar link"}
                  {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-[#7d8494]">
                Lembrou a senha?{" "}
                <Link href="/login" className="font-semibold text-[#1B4A9A]">
                  Entrar
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
