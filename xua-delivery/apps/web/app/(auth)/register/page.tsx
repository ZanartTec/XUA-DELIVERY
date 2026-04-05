"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@/src/schemas/auth";
import { useAuthStore } from "@/src/store/auth";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { GlassWater, ArrowRight } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json();
        setServerError(body.error || "Erro ao cadastrar");
        return;
      }

      const { user } = await res.json();
      setUser(user);
      router.push("/");
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
        Start your{" "}
        <span className="bg-linear-to-r from-[#0041c8] to-[#0055ff] bg-clip-text text-transparent">
          hydration journey
        </span>
      </h1>
      <p className="text-sm text-[#434656] mb-8">
        Create your account and never run out of water.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <div className="rounded-xl bg-[#ffdad6]/90 px-4 py-3 text-sm text-[#93000a] text-center backdrop-blur-sm">
            {serverError}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="name" className="text-[11px] font-semibold tracking-widest text-[#434656] uppercase">Full Name</label>
          <Input id="name" className="h-12 rounded-xl border-0 bg-white/70 backdrop-blur-sm text-[#191c1d] placeholder:text-[#737688]/70 shadow-none focus:bg-white focus:ring-2 focus:ring-[#0055ff]/20" placeholder="Your full name" {...register("name")} />
          {errors.name && <p className="text-xs text-[#ba1a1a]">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reg-email" className="text-[11px] font-semibold tracking-widest text-[#434656] uppercase">Email Address</label>
          <Input id="reg-email" type="email" className="h-12 rounded-xl border-0 bg-white/70 backdrop-blur-sm text-[#191c1d] placeholder:text-[#737688]/70 shadow-none focus:bg-white focus:ring-2 focus:ring-[#0055ff]/20" placeholder="name@example.com" {...register("email")} />
          {errors.email && <p className="text-xs text-[#ba1a1a]">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="phone" className="text-[11px] font-semibold tracking-widest text-[#434656] uppercase">Phone</label>
          <Input id="phone" type="tel" className="h-12 rounded-xl border-0 bg-white/70 backdrop-blur-sm text-[#191c1d] placeholder:text-[#737688]/70 shadow-none focus:bg-white focus:ring-2 focus:ring-[#0055ff]/20" placeholder="(11) 99999-0000" {...register("phone")} />
          {errors.phone && <p className="text-xs text-[#ba1a1a]">{errors.phone.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reg-password" className="text-[11px] font-semibold tracking-widest text-[#434656] uppercase">Password</label>
          <Input id="reg-password" type="password" className="h-12 rounded-xl border-0 bg-white/70 backdrop-blur-sm text-[#191c1d] placeholder:text-[#737688]/70 shadow-none focus:bg-white focus:ring-2 focus:ring-[#0055ff]/20" placeholder="At least 8 characters" {...register("password")} />
          {errors.password && <p className="text-xs text-[#ba1a1a]">{errors.password.message}</p>}
        </div>

        <Button
          type="submit"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] text-base font-semibold text-white shadow-[0_4px_24px_rgba(0,65,200,0.25)] transition-all hover:opacity-95 active:scale-[0.98]"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating..." : "Create Account"}
          {!isSubmitting && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>

      {/* Footer */}
      <p className="mt-8 text-center text-sm text-[#434656]">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-[#0041c8] hover:text-[#0055ff]">
          Sign in
        </Link>
      </p>
    </>
  );
}
