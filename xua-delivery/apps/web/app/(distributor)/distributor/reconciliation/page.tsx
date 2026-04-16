"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";

interface ReconciliationRow {
  order_id: string;
  consumer_name: string;
  sent_qty: number;
  returned_qty: number;
  delta: number;
}

export default function ReconciliationPage() {
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [justification, setJustification] = useState("");

  useEffect(() => {
    fetch("/api/ops/reconciliations")
      .then((r) => r.json())
      .then((data) => setRows(data.rows ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalSent = rows.reduce((sum, row) => sum + row.sent_qty, 0);
  const totalReturned = rows.reduce((sum, row) => sum + row.returned_qty, 0);
  const totalDelta = totalSent - totalReturned;
  const justificationRequired = totalDelta > 0;
  const canSubmit = !submitting && !submitted && rows.length > 0 && (!justificationRequired || justification.trim().length >= 5);

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/ops/reconciliations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: rows.map((r) => ({
            order_id: r.order_id,
            returned_empty_qty: r.returned_qty,
          })),
          justification: justification.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSubmitError(body.error ?? "Erro ao confirmar conciliação.");
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitError("Erro de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  function updateRow(index: number, field: "returned_qty", value: number) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index
          ? { ...row, [field]: value, delta: row.sent_qty - value }
          : row
      )
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-bold font-heading text-foreground">Conciliação de Estoque</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-2xl bg-white/80 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)]">
            <div className="h-4 w-48 rounded-lg bg-[#e1e3e4]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold font-heading text-foreground">Conciliação de Estoque</h1>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saídas</p>
          <p className="mt-2 text-3xl font-bold">{totalSent}</p>
        </div>
        <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Retornos</p>
          <p className="mt-2 text-3xl font-bold">{totalReturned}</p>
        </div>
        <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delta do dia</p>
          <p className={`mt-2 text-3xl font-bold ${totalDelta > 0 ? "text-red-600" : totalDelta < 0 ? "text-amber-600" : "text-green-600"}`}>
            {totalDelta > 0 ? `+${totalDelta}` : totalDelta}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <p className="mb-3 text-sm font-semibold font-heading">Saídas vs Retornos</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ borderBottom: "1px solid #e1e3e4" }}>
                <th className="py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground">Pedido / Cliente</th>
                <th className="py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground text-center">Saíram</th>
                <th className="py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground text-center">Retornaram</th>
                <th className="py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground text-center">Delta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.order_id} style={{ borderBottom: "1px solid #e1e3e4" }}>
                  <td className="py-2">
                    <div className="font-medium">Pedido #{row.order_id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{row.consumer_name}</div>
                  </td>
                  <td className="py-2 text-center">{row.sent_qty}</td>
                  <td className="py-2 text-center">
                    <input
                      type="number"
                      min={0}
                      value={row.returned_qty}
                      onChange={(e) =>
                        updateRow(i, "returned_qty", parseInt(e.target.value) || 0)
                      }
                      className="w-16 text-center rounded-lg border-0 bg-[#e1e3e4] px-1 py-0.5"
                    />
                  </td>
                  <td
                    className={`py-2 text-center font-medium ${
                      row.delta > 0 ? "text-red-600" : row.delta < 0 ? "text-amber-600" : "text-green-600"
                    }`}
                  >
                    {row.delta > 0 ? `+${row.delta}` : row.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {justificationRequired && (
        <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
          <label className="mb-2 block text-sm font-semibold font-heading text-foreground" htmlFor="justification">
            Justificativa obrigatória
          </label>
          <textarea
            id="justification"
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
            placeholder="Explique a diferença entre saídas e retornos do dia"
            className="min-h-28 w-full rounded-xl border border-[#e1e3e4] bg-white px-3 py-2 text-sm outline-none transition focus:border-primary"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Quando o delta do dia for maior que zero, a justificativa é obrigatória para fechar a conciliação.
          </p>
        </div>
      )}

      <Button className="w-full rounded-xl bg-[#C8F708] hover:bg-[#C8F708]/90 text-[#1a2600] font-semibold shadow-none active:scale-[0.98]" disabled={!canSubmit} onClick={handleSubmit}>
        {submitting ? "Enviando..." : submitted ? "Conciliação confirmada!" : "Confirmar conciliação"}
      </Button>

      {submitError && (
        <p className="text-sm text-red-600 text-center">{submitError}</p>
      )}
    </div>
  );
}
