"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";

export default function OtpOverridePage() {
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOverride() {
    if (!orderId || !reason) {
      setError("Preencha todos os campos.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "otp_override", reason }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Erro ao realizar override");
        return;
      }
      setResult("Override realizado com sucesso. O pedido foi marcado como entregue.");
      setOrderId("");
      setReason("");
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold font-heading">OTP Override</h1>

      <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-4">
        <p className="text-sm font-semibold font-heading">Override manual de OTP</p>
        <p className="text-sm text-muted-foreground">
          Use esta função em casos excepcionais onde o consumidor não consegue
          fornecer o código OTP. Todas as ações são registradas na auditoria.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ID do pedido *</label>
          <Input placeholder="Ex: abc-123" value={orderId} onChange={(e) => setOrderId(e.target.value)} className="rounded-xl border-0 bg-[#e1e3e4]" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Motivo *</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-xl border-0 bg-[#e1e3e4] px-3 py-2 text-sm h-24 resize-none" placeholder="Descreva o motivo do override..." />
        </div>

        {error && <div className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
        {result && <div className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700">{result}</div>}

        <Button className="w-full rounded-xl bg-primary hover:bg-primary-hover font-semibold shadow-none hover:opacity-90 active:scale-[0.98]" disabled={loading || !orderId || !reason} onClick={handleOverride}>
          {loading ? "Processando..." : "Confirmar Override"}
        </Button>
      </div>
    </div>
  );
}
