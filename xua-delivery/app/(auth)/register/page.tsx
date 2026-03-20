"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerSchema } from "@/src/schemas/auth";
import { useAuthStore } from "@/src/store/auth";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/src/components/ui/card";

export default function RegisterPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Erro ao cadastrar");
        return;
      }

      const { user } = await res.json();
      setUser(user);
      router.push("/catalog");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center text-2xl">Criar conta</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">Nome</label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="reg-email" className="text-sm font-medium">E-mail</label>
            <Input
              id="reg-email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="phone" className="text-sm font-medium">Telefone</label>
            <Input
              id="phone"
              type="tel"
              placeholder="(11) 99999-0000"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="reg-password" className="text-sm font-medium">Senha</label>
            <Input
              id="reg-password"
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Cadastrando..." : "Cadastrar"}
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
