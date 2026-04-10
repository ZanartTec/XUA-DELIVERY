"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";

const FAILURE_REASONS = [
  { value: "Cliente ausente", label: "Cliente ausente" },
  { value: "Sem acesso ao local", label: "Sem acesso ao local" },
  { value: "Endereço incorreto", label: "Endereço incorreto" },
  { value: "Local inseguro", label: "Local inseguro" },
  { value: "Outro", label: "Outro" },
] as const;

export default function DriverFailurePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [reason, setReason] = useState<(typeof FAILURE_REASONS)[number]["value"] | "">("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsDetails = reason === "Outro";

  async function handleSubmit() {
    if (!reason) {
      setError("Selecione um motivo.");
      return;
    }

    if (needsDetails && details.trim().length < 10) {
      setError("Descreva o motivo com ao menos 10 caracteres.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const finalReason = needsDetails ? `${reason}: ${details.trim()}` : reason;
      const response = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delivery_failed", reason: finalReason }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || "Não foi possível registrar a falha.");
        return;
      }

      router.push("/driver/history");
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white/95 p-6 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <h2 className="text-center text-lg font-bold font-heading">Registrar falha</h2>
        <p className="text-center text-sm text-muted-foreground">
          Pedido #{id} — Informe o motivo para que suporte ou operações tratem a reentrega.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Motivo *</label>
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value as (typeof FAILURE_REASONS)[number]["value"] | "")}
            className="w-full rounded-xl border-0 bg-[#e1e3e4] px-3 py-2 text-sm"
          >
            <option value="">Selecione...</option>
            {FAILURE_REASONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detalhes</label>
          <Textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            className="h-24 rounded-xl border-0 bg-[#e1e3e4] px-3 py-2 text-sm resize-none"
            placeholder={needsDetails ? "Descreva o ocorrido..." : "Opcional"}
          />
        </div>

        {error && <p className="text-center text-sm text-destructive">{error}</p>}

        <Button
          className="w-full rounded-xl bg-linear-to-r from-[#b42318] to-[#d92d20] font-semibold shadow-none hover:opacity-90 active:scale-[0.98]"
          disabled={loading || !reason || (needsDetails && details.trim().length < 10)}
          onClick={handleSubmit}
        >
          {loading ? "Registrando..." : "Registrar falha"}
        </Button>

        <Button className="w-full rounded-xl border-0 bg-[#e1e3e4] text-foreground hover:bg-[#d1d3d4]" onClick={() => router.back()}>
          Voltar
        </Button>
      </div>
    </div>
  );
}