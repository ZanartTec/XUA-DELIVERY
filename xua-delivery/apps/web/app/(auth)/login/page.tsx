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
    <div className="relative h-dvh overflow-hidden">
      {/* Imagem de fundo cobrindo toda a tela */}
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

      {/* Gradiente bem suave — apenas leve névoa para legibilidade, sem chegar no branco */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, transparent 20%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.35) 65%, rgba(255,255,255,0.50) 100%)",
        }}
      />

      {/* Conteúdo — tudo cabe na tela, sem scroll */}
      <div className="relative z-10 flex h-full flex-col justify-between px-6 pt-[calc(env(safe-area-inset-top)+2rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:mx-auto sm:max-w-md sm:pt-8 sm:pb-6">
        {/* Logo no topo */}
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-transparent.png"
            alt="Xuá Água Mineral"
            className="h-28 w-auto drop-shadow-[0_4px_24px_rgba(0,0,0,0.25)]"
          />
        </div>

        {/* Formulário compacto na parte inferior */}
        <div className="mb-4 rounded-2xl bg-white/70 backdrop-blur-md p-5 shadow-lg shadow-black/5">
          <h1 className="font-heading text-xl font-extrabold leading-tight text-[#0d1b2f]">
            Seja bem-vindo
          </h1>
          <p className="mt-0.5 text-xs text-[#7d8494]">
            Acesse sua conta para continuar
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
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
                className="h-11 rounded-xl border border-[#e8eaf0] bg-white/80 shadow-none focus-visible:border-[#C8F708] focus-visible:ring-1 focus-visible:ring-[#C8F708]/60"
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
                className="h-11 rounded-xl border border-[#e8eaf0] bg-white/80 shadow-none focus-visible:border-[#C8F708] focus-visible:ring-1 focus-visible:ring-[#C8F708]/60"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#C8F708] text-[#1a2600] text-base font-semibold transition-all hover:bg-[#C8F708]/90 active:scale-[0.98] disabled:opacity-60"
            >
              {isSubmitting ? "Entrando..." : "Entrar"}
              {!isSubmitting && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          {/* Divisor */}
          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#eaecf0]" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b0b7c3]">
              ou continue com
            </span>
            <div className="h-px flex-1 bg-[#eaecf0]" />
          </div>

          {/* Social */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#e8eaf0] bg-white/80 text-sm font-semibold text-[#0d1b2f] transition-colors hover:bg-white"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Google
            </button>
            <button
              type="button"
              className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#e8eaf0] bg-white/80 text-sm font-semibold text-[#0d1b2f] transition-colors hover:bg-white"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#191c1d">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              Apple
            </button>
          </div>

          <p className="mt-4 text-center text-sm text-[#7d8494]">
            Novo no Xuá?{" "}
            <Link href="/register" className="font-semibold text-[#1B4A9A]">
              Registre-se
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
