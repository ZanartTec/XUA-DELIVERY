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
    <div className="relative min-h-dvh overflow-x-hidden bg-[#f8f9fa] lg:bg-white lg:h-screen lg:overflow-hidden">
      {/* Imagem de fundo fixa (apenas mobile/tablet) */}
      <div className="fixed inset-0 -z-20 lg:hidden">
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

      {/* Gradiente fixo (apenas mobile/tablet) */}
      <div
        className="fixed inset-0 -z-10 lg:hidden"
        style={{
          background:
            "linear-gradient(to bottom, transparent 20%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.35) 65%, rgba(255,255,255,0.50) 100%)",
        }}
      />

      {/* Grid principal para suportar o split-screen no desktop */}
      <div className="relative z-10 grid min-h-dvh w-full grid-cols-12 lg:h-full lg:overflow-hidden">
        {/* Painel do Formulário (Esquerda) */}
        <div className="col-span-12 flex min-h-dvh flex-col justify-between px-6 pt-[calc(env(safe-area-inset-top)+2rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:mx-auto sm:max-w-md sm:w-full sm:pt-8 sm:pb-6 lg:col-span-5 lg:max-w-none lg:w-full lg:mx-0 lg:px-12 lg:py-10 lg:bg-white lg:shadow-[4px_0_24px_rgba(0,0,0,0.05)] lg:h-full lg:overflow-y-auto xl:col-span-4 xl:px-16">
          {/* Logo no topo */}
          <div className="flex justify-center lg:justify-start lg:mb-4 shrink-0 mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-transparent.png"
              alt="Xuá Água Mineral"
              className="h-24 lg:h-20 w-auto drop-shadow-[0_4px_24px_rgba(0,0,0,0.25)] lg:drop-shadow-none"
            />
          </div>

          {/* Formulário na parte inferior (ou painel desktop centralizado) */}
          <div className="mt-auto lg:my-auto w-full max-w-sm mx-auto rounded-2xl bg-white/70 backdrop-blur-md p-5 shadow-lg shadow-black/5 lg:bg-transparent lg:backdrop-blur-none lg:p-0 lg:shadow-none">
            <h1 className="font-heading text-xl lg:text-2xl font-extrabold leading-tight text-[#0d1b2f]">
              Crie sua conta
            </h1>
            <p className="mt-0.5 text-xs lg:text-sm text-[#7d8494]">
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
