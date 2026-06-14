"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/src/schemas/auth";
import { Input } from "@/src/components/ui/input";
import { ArrowRight } from "lucide-react";

export default function LoginPage() {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

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
        const body = await res.json();
        setServerError(body.error || "Credenciais inválidas");
        return;
      }

      window.location.replace("/");
    } catch {
      setServerError("Erro de conexão. Tente novamente.");
    }
  }

  return (
    <div className="relative h-dvh overflow-hidden bg-[#f8f9fa] lg:bg-white">
      {/* Imagem de fundo cobrindo toda a tela (apenas mobile/tablet) */}
      <div className="absolute inset-0 lg:hidden">
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

      {/* Gradiente bem suave — apenas leve névoa para legibilidade, sem chegar no branco (apenas mobile/tablet) */}
      <div
        className="absolute inset-0 lg:hidden"
        style={{
          background:
            "linear-gradient(to bottom, transparent 20%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.35) 65%, rgba(255,255,255,0.50) 100%)",
        }}
      />

      {/* Grid principal para suportar o split-screen no desktop */}
      <div className="relative z-10 grid h-full w-full grid-cols-12 lg:overflow-hidden">
        {/* Painel do Formulário (Esquerda) */}
        <div className="col-span-12 flex h-full flex-col justify-between px-6 pt-[calc(env(safe-area-inset-top)+2rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:mx-auto sm:max-w-md sm:w-full sm:pt-8 sm:pb-6 lg:col-span-5 lg:max-w-none lg:w-full lg:mx-0 lg:px-12 lg:py-10 lg:bg-white lg:shadow-[4px_0_24px_rgba(0,0,0,0.05)] lg:overflow-y-auto xl:col-span-4 xl:px-16">
          {/* Logo no topo */}
          <div className="flex justify-center lg:justify-start lg:mb-4 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-transparent.png"
              alt="Xuá Água Mineral"
              className="h-24 lg:h-20 w-auto drop-shadow-[0_4px_24px_rgba(0,0,0,0.25)] lg:drop-shadow-none"
            />
          </div>

          {/* Formulário compacto (ou painel desktop centralizado) */}
          <div className="my-auto w-full max-w-sm mx-auto rounded-2xl bg-white/70 backdrop-blur-md p-5 shadow-lg shadow-black/5 lg:bg-transparent lg:backdrop-blur-none lg:p-0 lg:shadow-none">
            <h1 className="font-heading text-xl lg:text-2xl font-extrabold leading-tight text-[#0d1b2f]">
              Seja bem-vindo
            </h1>
            <p className="mt-0.5 text-xs lg:text-sm text-[#7d8494]">
              Acesse sua conta para continuar
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-4 lg:mt-6 space-y-3 lg:space-y-4">
              {serverError && (
                <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600 text-center">
                  {serverError}
                </div>
              )}

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

              {/* Senha */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ba3af]"
                  >
                    Senha
                  </label>
                  <button type="button" className="text-xs font-semibold text-[#1B4A9A]">
                    Esqueceu?
                  </button>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
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
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#00E0FF] text-[#001735] text-base font-semibold transition-all hover:bg-[#00E0FF]/90 active:scale-[0.98] disabled:opacity-60"
              >
                {isSubmitting ? "Entrando..." : "Entrar"}
                {!isSubmitting && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            <p className="mt-4 lg:mt-6 text-center text-sm text-[#7d8494]">
              Novo no Xuá?{" "}
              <Link href="/register" className="font-semibold text-[#1B4A9A]">
                Registre-se
              </Link>
            </p>
          </div>
        </div>

        {/* Coluna Direta (Painel de Marketing do Desktop) */}
        <div className="hidden lg:block lg:col-span-7 xl:col-span-8 relative h-full">
          <Image
            src="/woman-water2.webp"
            alt=""
            aria-hidden
            fill
            priority
            quality={85}
            sizes="(max-width: 1024px) 0px, 60vw"
            className="object-cover object-top"
          />
          {/* Degradê/Overlay de cores da nova identidade */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, rgba(27,74,154,0.45) 0%, rgba(0,224,255,0.2) 100%)",
            }}
          />

          {/* Conteúdo flutuante com design premium */}
          <div className="absolute inset-0 flex flex-col justify-between p-12 text-white">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#00E0FF] animate-pulse" />
              <span className="text-sm font-semibold uppercase tracking-wider text-white/95">
                Xuá Delivery
              </span>
            </div>

            <div className="max-w-lg space-y-4 bg-black/10 backdrop-blur-md p-8 rounded-2xl border border-white/10 shadow-2xl">
              <h2 className="text-3xl xl:text-4xl font-extrabold font-heading tracking-tight leading-tight">
                A pureza que te move em cada gota.
              </h2>
              <p className="text-base text-white/90">
                Peça sua água mineral de forma simples, rápida e receba no conforto da sua casa ou empresa.
              </p>

              <div className="pt-2 flex gap-6 border-t border-white/15">
                <div>
                  <p className="text-2xl font-bold text-[#00E0FF]">100%</p>
                  <p className="text-[10px] uppercase font-semibold text-white/70">Mineral Natural</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#00E0FF]">Express</p>
                  <p className="text-[10px] uppercase font-semibold text-white/70">Entrega Ágil</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#00E0FF]">+10k</p>
                  <p className="text-[10px] uppercase font-semibold text-white/70">Clientes Atendidos</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
