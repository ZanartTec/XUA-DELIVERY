"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/src/store/auth";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";

export default function ProfileEditPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [consumerId, setConsumerId] = useState<string | null>(user?.id ?? null);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.consumer) {
          setConsumerId(data.consumer.id);
          setForm({
            name: data.consumer.name,
            email: data.consumer.email,
            phone: data.consumer.phone,
          });
        }
      })
      .catch(() => {});
  }, []);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consumerId) {
      setError("Usuário não identificado. Recarregue a página.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/consumers/${consumerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Erro ao atualizar");
        return;
      }
      router.push("/profile");
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="px-4 pt-4">
        <h1 className="text-lg font-bold font-heading">Editar perfil</h1>
      </div>
      <div className="mx-4 rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <p className="mb-3 text-sm font-semibold font-heading">Dados pessoais</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome</label>
            <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} required className="rounded-xl border-0 bg-[#e1e3e4]" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">E-mail</label>
            <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required className="rounded-xl border-0 bg-[#e1e3e4]" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="phone" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Telefone</label>
            <Input id="phone" type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} required className="rounded-xl border-0 bg-[#e1e3e4]" />
          </div>
          <Button type="submit" className="w-full rounded-xl bg-primary hover:bg-primary-hover font-semibold shadow-none hover:opacity-90 active:scale-[0.98]" disabled={loading}>
            {loading ? "Salvando..." : "Salvar alterações"}
          </Button>
        </form>
      </div>
    </div>
  );
}
