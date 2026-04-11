"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@/src/schemas/auth";
import { Button } from "@/src/components/ui/button";
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
    <>
      {/* Brand */}
      <div className="mb-8 flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-transparent.png" alt="Xuá Água Mineral" className="h-24 w-auto" />
      </div>

      {/* Hero Headline */}
      <h1 className="font-heading text-[2rem] leading-[1.15] font-extrabold tracking-tight text-secondary-foreground mb-2">
        Start your{" "}
        <span className="bg-linear-to-r from-primary to-primary-hover bg-clip-text text-transparent">
          hydration journey
        </span>
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        Create your account and never run out of water.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive text-center backdrop-blur-sm">
            {serverError}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="name" className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Full Name</label>
          <Input id="name" className="h-12 rounded-xl border-0 bg-white/70 backdrop-blur-sm text-foreground placeholder:text-muted-foreground/70 shadow-none focus:bg-white focus:ring-2 focus:ring-ring/20" placeholder="Your full name" {...register("name")} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reg-email" className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Email Address</label>
          <Input id="reg-email" type="email" className="h-12 rounded-xl border-0 bg-white/70 backdrop-blur-sm text-foreground placeholder:text-muted-foreground/70 shadow-none focus:bg-white focus:ring-2 focus:ring-ring/20" placeholder="name@example.com" {...register("email")} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="phone" className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Phone</label>
          <Input id="phone" type="tel" className="h-12 rounded-xl border-0 bg-white/70 backdrop-blur-sm text-foreground placeholder:text-muted-foreground/70 shadow-none focus:bg-white focus:ring-2 focus:ring-ring/20" placeholder="(11) 99999-0000" {...register("phone")} />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reg-password" className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Password</label>
          <Input id="reg-password" type="password" className="h-12 rounded-xl border-0 bg-white/70 backdrop-blur-sm text-foreground placeholder:text-muted-foreground/70 shadow-none focus:bg-white focus:ring-2 focus:ring-ring/20" placeholder="At least 8 characters" {...register("password")} />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>

        <Button
          type="submit"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground text-base font-semibold shadow-[0_4px_24px_rgba(27,74,154,0.25)] transition-all hover:bg-primary-hover active:scale-[0.98]"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating..." : "Create Account"}
          {!isSubmitting && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>

      {/* Footer */}
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary hover:text-primary-hover">
          Sign in
        </Link>
      </p>
    </>
  );
}
