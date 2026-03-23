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
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/src/components/ui/card";

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
      router.push("/catalog");
    } catch {
      setServerError("Erro de conexão. Tente novamente.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center text-2xl">Criar conta</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {serverError && (
            <p className="text-sm text-red-600 text-center">{serverError}</p>
          )}
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">Nome</label>
            <Input
              id="name"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <label htmlFor="reg-email" className="text-sm font-medium">E-mail</label>
            <Input
              id="reg-email"
              type="email"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-sm text-red-600">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <label htmlFor="phone" className="text-sm font-medium">Telefone</label>
            <Input
              id="phone"
              type="tel"
              placeholder="(11) 99999-0000"
              {...register("phone")}
            />
            {errors.phone && (
              <p className="text-sm text-red-600">{errors.phone.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <label htmlFor="reg-password" className="text-sm font-medium">Senha</label>
            <Input
              id="reg-password"
              type="password"
              placeholder="Mínimo 8 caracteres"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-red-600">{errors.password.message}</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Cadastrando..." : "Cadastrar"}
          </Button>
          <p className="text-sm text-center text-gray-500">
            Já tem conta?{" "}
            <Link href="/login" className="text-blue-600 hover:underline">
              Entrar
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
