"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";

const REASONS = [
  { value: "absent", label: "Consumidor ausente" },
  { value: "wrong_address", label: "Endereço incorreto" },
  { value: "refused", label: "Recusado pelo consumidor" },
  { value: "access_denied", label: "Acesso impossibilitado" },
  { value: "other", label: "Outro" },
];

export default function NonCollectionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!reason) {
      setError("Selecione um motivo.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${id}/empty-not-collected`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, notes }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Erro ao registrar");
        return;
      }
      router.push("/driver/deliveries");
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center">Não coleta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Pedido #{id} — Registre o motivo da não coleta de vasilhames.
          </p>

          <div className="space-y-2">
            <label className="text-sm font-medium">Motivo *</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">Selecione...</option>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm h-20 resize-none"
              placeholder="Detalhes adicionais..."
            />
          </div>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}

          <Button className="w-full" disabled={loading || !reason} onClick={handleSubmit}>
            {loading ? "Registrando..." : "Registrar não coleta"}
          </Button>

          <Button variant="outline" className="w-full" onClick={() => router.back()}>
            Voltar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
