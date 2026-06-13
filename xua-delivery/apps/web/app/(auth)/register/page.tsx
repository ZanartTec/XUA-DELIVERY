"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@/src/schemas/auth";
import { Input } from "@/src/components/ui/input";
import { ArrowRight } from "lucide-react";

export default function RegisterPage() {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  async function onSubmit(data: RegisterInput) {
    setServerError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json();
        setServerError(body.error || "Erro ao cadastrar");
        return;
      }

      window.location.replace("/");
    } catch {
      setServerError("Erro de conexão. Tente novamente.");
    }
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      {/* Imagem de fundo fixa */}
      <div className="fixed inset-0 -z-20">
        <Image
          src="/woman-water2.webp"
          alt=""
          aria-hidden
          fill
          priority
          quality={70}
          sizes="100vw"
          className="object-cover object-top"
        />
      </div>

      {/* Gradiente fixo */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background:
            "linear-gradient(to bottom, transparent 20%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.35) 65%, rgba(255,255,255,0.50) 100%)",
        }}
      />

      {/* Conteúdo rolável */}
      <div className="relative z-10 flex min-h-dvh flex-col justify-between px-6 pt-[calc(env(safe-area-inset-top)+2rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:mx-auto sm:max-w-md sm:pt-8 sm:pb-6">
        {/* Logo no topo */}
        <div className="flex justify-center shrink-0 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-transparent.png"
            alt="Xuá Água Mineral"
            className="h-28 w-auto drop-shadow-[0_4px_24px_rgba(0,0,0,0.25)]"
          />
        </div>

        {/* Formulário na parte inferior */}
        <div className="mt-auto mb-4 rounded-2xl bg-white/70 backdrop-blur-md p-5 shadow-lg shadow-black/5">
          <h1 className="font-heading text-xl font-extrabold leading-tight text-[#0d1b2f]">
            Crie sua conta
          </h1>
          <p className="mt-0.5 text-xs text-[#7d8494]">
            Preencha seus dados para continuar
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
            {serverError && (
              <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600 text-center">
                {serverError}
              </div>
            )}

            {/* Nome */}
            <div className="space-y-1">
              <label
                htmlFor="name"
                className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ba3af]"
              >
                Nome Completo
              </label>
              <Input
                id="name"
                type="text"
                placeholder="Seu nome completo"
                className="h-11 rounded-xl border border-[#e8eaf0] bg-white/80 shadow-none focus-visible:border-[#00E0FF] focus-visible:ring-1 focus-visible:ring-[#00E0FF]/60"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-red-500">{errors.name.message}</p>
              )}
            </div>

            {/* Email */}
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
                className="h-11 rounded-xl border border-[#e8eaf0] bg-white/80 shadow-none focus-visible:border-[#00E0FF] focus-visible:ring-1 focus-visible:ring-[#00E0FF]/60"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            {/* Telefone */}
            <div className="space-y-1">
              <label
                htmlFor="phone"
                className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ba3af]"
              >
                Telefone
              </label>
              <Input
                id="phone"
                type="tel"
                placeholder="(11) 99999-0000"
                className="h-11 rounded-xl border border-[#e8eaf0] bg-white/80 shadow-none focus-visible:border-[#00E0FF] focus-visible:ring-1 focus-visible:ring-[#00E0FF]/60"
                {...register("phone")}
              />
              {errors.phone && (
                <p className="text-xs text-red-500">{errors.phone.message}</p>
              )}
            </div>

            {/* Senha */}
            <div className="space-y-1">
              <label
                htmlFor="password"
                className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ba3af]"
              >
                Senha
              </label>
              <Input
                id="password"
                type="password"
                placeholder="No mínimo 8 caracteres"
                className="h-11 rounded-xl border border-[#e8eaf0] bg-white/80 shadow-none focus-visible:border-[#00E0FF] focus-visible:ring-1 focus-visible:ring-[#00E0FF]/60"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#00E0FF] text-[#001735] text-base font-semibold transition-all hover:bg-[#00E0FF]/90 active:scale-[0.98] disabled:opacity-60 mt-4"
            >
              {isSubmitting ? "Criando..." : "Criar Conta"}
              {!isSubmitting && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-[#7d8494]">
            Já tem uma conta?{" "}
            <Link href="/login" className="font-semibold text-[#1B4A9A]">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
