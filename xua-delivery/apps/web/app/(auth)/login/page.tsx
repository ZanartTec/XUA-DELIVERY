"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/src/schemas/auth";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { GlassWater, ArrowRight } from "lucide-react";

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
    <>
      {/* Brand */}
      <div className="mb-8 flex items-center gap-2">
        <GlassWater className="h-6 w-6 text-[#0041c8]" strokeWidth={1.5} />
        <span className="text-lg font-heading italic font-bold text-[#001a40]">Xuá</span>
      </div>

      {/* Hero Headline */}
      <h1 className="font-heading text-[2rem] leading-[1.15] font-extrabold tracking-tight text-[#001a40] mb-2">
        Seja Bem-vindo{" "}
        <span className="bg-linear-to-r from-[#0041c8] to-[#0055ff] bg-clip-text text-transparent">
          ao Xua Delivery
        </span>
      </h1>
      <p className="text-sm text-[#434656] mb-8">
        Hidratação pura, entregue em sua casa.
      </p>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {serverError && (
          <div className="rounded-xl bg-[#ffdad6]/90 px-4 py-3 text-sm text-[#93000a] text-center backdrop-blur-sm">
            {serverError}
          </div>
        )}

        {/* Email */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-[11px] font-semibold tracking-widest text-[#434656] uppercase">
            Endereço de Email
          </label>
          <Input
            id="email"
            type="email"
            placeholder="nome@exemplo.com"
            className="h-12 rounded-xl border-0 bg-white/70 backdrop-blur-sm text-[#191c1d] placeholder:text-[#737688]/70 shadow-none focus:bg-white focus:ring-2 focus:ring-[#0055ff]/20"
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-[#ba1a1a]">{errors.email.message}</p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-[11px] font-semibold tracking-widest text-[#434656] uppercase">
              Senha
            </label>
            <button type="button" className="text-xs text-[#0041c8] hover:text-[#0055ff] font-medium">
              Esqueceu?
            </button>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            className="h-12 rounded-xl border-0 bg-white/70 backdrop-blur-sm text-[#191c1d] placeholder:text-[#737688]/70 shadow-none focus:bg-white focus:ring-2 focus:ring-[#0055ff]/20"
            {...register("password")}
          />
          {errors.password && (
            <p className="text-xs text-[#ba1a1a]">{errors.password.message}</p>
          )}
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={isSubmitting}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] text-base font-semibold text-white shadow-[0_4px_24px_rgba(0,65,200,0.25)] transition-all hover:opacity-95 active:scale-[0.98]"
        >
          {isSubmitting ? "Entering..." : "Enter"}
          {!isSubmitting && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>

      {/* Divider */}
      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-[#c3c5d9]/40" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#737688]">Or continue with</span>
        <div className="h-px flex-1 bg-[#c3c5d9]/40" />
      </div>

      {/* Social Login */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#c3c5d9]/40 bg-white/60 backdrop-blur-sm text-sm font-semibold text-[#191c1d] transition-colors hover:bg-white/80"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Google
        </button>
        <button
          type="button"
          className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#c3c5d9]/40 bg-white/60 backdrop-blur-sm text-sm font-semibold text-[#191c1d] transition-colors hover:bg-white/80"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#191c1d"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
          Apple
        </button>
      </div>

      {/* Footer */}
      <p className="mt-8 text-center text-sm text-[#434656]">
        Novo no Xuá?{" "}
        <Link href="/register" className="font-semibold text-[#0041c8] hover:text-[#0055ff]">
          Registre-se
        </Link>
      </p>
    </>
  );
}
