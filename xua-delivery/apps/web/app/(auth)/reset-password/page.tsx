"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { resetPasswordSchema } from "@/src/schemas/auth";
import { Input } from "@/src/components/ui/input";
import { ArrowRight, CheckCircle2 } from "lucide-react";

// Estende o schema compartilhado com confirmação de senha (validação só no cliente).
const formSchema = resetPasswordSchema
  .pick({ password: true })
  .extend({ confirm: z.string() })
  .refine((d) => d.password === d.confirm, {
    message: "As senhas não coincidem",
    path: ["confirm"],
  });

type FormInput = z.infer<typeof formSchema>;

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({
    resolver: zodResolver(formSchema),
  });

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
      setTimeout(() => router.replace("/login"), 2500);
    } catch {
      setServerError("Erro de conexão. Tente novamente.");
    }
  }

  if (!token) {
    return (
      <div className="text-center">
        <h1 className="font-heading text-xl font-extrabold text-[#0d1b2f]">Link inválido</h1>
        <p className="mt-2 text-sm text-[#7d8494]">
          Este link de redefinição é inválido ou está incompleto. Solicite um novo.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#00E0FF] text-base font-semibold text-[#001735] transition-all hover:bg-[#00E0FF]/90 active:scale-[0.98]"
        >
          Solicitar novo link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[#00E0FF]" />
        <h1 className="mt-3 font-heading text-xl font-extrabold text-[#0d1b2f]">Senha redefinida!</h1>
        <p className="mt-2 text-sm text-[#7d8494]">
          Sua senha foi atualizada. Redirecionando para o login...
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-heading text-xl font-extrabold leading-tight text-[#0d1b2f]">
        Criar nova senha
      </h1>
      <p className="mt-0.5 text-sm text-[#7d8494]">
        Escolha uma nova senha para sua conta. Mínimo de 8 caracteres.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        {serverError && (
          <div className="rounded-xl bg-red-50 px-4 py-2.5 text-center text-sm text-red-600">
            {serverError}
          </div>
        )}

        <div className="space-y-1">
          <label
            htmlFor="password"
            className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ba3af]"
          >
            Nova senha
          </label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            className="h-11 rounded-xl border border-[#e8eaf0] bg-white shadow-none focus-visible:border-[#00E0FF] focus-visible:ring-1 focus-visible:ring-[#00E0FF]/60"
            {...register("password")}
          />
          {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
        </div>

        <div className="space-y-1">
          <label
            htmlFor="confirm"
            className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ba3af]"
          >
            Confirmar senha
          </label>
          <Input
            id="confirm"
            type="password"
            placeholder="••••••••"
            className="h-11 rounded-xl border border-[#e8eaf0] bg-white shadow-none focus-visible:border-[#00E0FF] focus-visible:ring-1 focus-visible:ring-[#00E0FF]/60"
            {...register("confirm")}
          />
          {errors.confirm && <p className="text-xs text-red-500">{errors.confirm.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#00E0FF] text-base font-semibold text-[#001735] transition-all hover:bg-[#00E0FF]/90 active:scale-[0.98] disabled:opacity-60"
        >
          {isSubmitting ? "Salvando..." : "Redefinir senha"}
          {!isSubmitting && <ArrowRight className="h-4 w-4" />}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f8f9fa] px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-transparent.png" alt="Xuá Água Mineral" className="h-20 w-auto" />
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-lg shadow-black/5">
          <Suspense fallback={<p className="text-center text-sm text-[#7d8494]">Carregando...</p>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
