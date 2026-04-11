"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { useOfflineSync } from "@/src/hooks/use-offline-sync";

const REASONS = [
  { value: "client_absent", label: "Cliente ausente" },
  { value: "no_access", label: "Sem acesso ao local" },
  { value: "no_empty_bottles", label: "Sem vasilhame" },
  { value: "unsafe_location", label: "Local inseguro" },
  { value: "other", label: "Outro" },
 ] as const;

export default function NonCollectionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isOnline, enqueue } = useOfflineSync();
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"] | "">("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsDetails = reason === "other";

  async function handleSubmit() {
    if (!reason) {
      setError("Selecione um motivo.");
      return;
    }
    if (needsDetails && notes.trim().length < 10) {
      setError("Detalhe deve ter ao menos 10 caracteres.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (!isOnline) {
        await enqueue({
          type: "non_collection",
          url: `/api/orders/${id}/empty-not-collected`,
          method: "POST",
          body: { reason, notes: notes.trim() || undefined },
        });
        router.push("/driver/deliveries");
        return;
      }

      const res = await fetch(`/api/orders/${id}/empty-not-collected`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, notes: notes.trim() || undefined }),
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
      <div className="w-full max-w-sm rounded-2xl bg-white/95 p-6 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-4">
        <h2 className="text-center text-lg font-bold font-heading">Não coleta</h2>
        <p className="text-sm text-muted-foreground text-center">
          Pedido #{id} — Registre o motivo da não coleta de vasilhames.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Motivo *</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
            className="w-full rounded-xl border-0 bg-[#e1e3e4] px-3 py-2 text-sm"
          >
            <option value="">Selecione...</option>
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Observações</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-20 rounded-xl border-0 bg-[#e1e3e4] px-3 py-2 text-sm resize-none"
            placeholder={needsDetails ? "Descreva o motivo da não coleta..." : "Detalhes adicionais..."}
          />
        </div>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}

        <Button className="w-full rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] font-semibold shadow-none hover:opacity-90 active:scale-[0.98]" disabled={loading || !reason || (needsDetails && notes.trim().length < 10)} onClick={handleSubmit}>
          {loading ? "Registrando..." : "Registrar não coleta"}
        </Button>

        <Button className="w-full rounded-xl border-0 bg-[#e1e3e4] text-foreground hover:bg-[#d1d3d4]" onClick={() => router.back()}>
          Voltar
        </Button>
      </div>
    </div>
  );
}
