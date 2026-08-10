"use client";

import { useState } from "react";
import { StatusPill } from "@/src/components/shared/status-pill";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { formatDate } from "@/src/lib/utils";
import { OrderStatus } from "@/src/types/enums";
import type { Order } from "@/src/types";

interface SearchResult extends Order {
  consumer_name: string;
  consumer_email: string;
  consumer_phone: string;
}

const REASONS = [
  { value: "elderly_no_smartphone", label: "Cliente idoso sem smartphone" },
  { value: "browser_technical_issue", label: "Problema técnico no navegador" },
  { value: "confirmed_by_phone", label: "Cliente confirmou por telefone" },
  { value: "other", label: "Outro" },
] as const;

export default function OtpOverridePage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [orderId, setOrderId] = useState("");
  const [date, setDate] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"] | "">("");
  const [details, setDetails] = useState("");
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overrideResult, setOverrideResult] = useState<string | null>(null);

  const needsDetails = reason === "other";

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const fields = { name, phone, email, document: cpf, id: orderId };
    const hasField = Object.values(fields).some((v) => v.trim().length >= 3);
    if (!hasField && !date) {
      setSearchError("Preencha ao menos um campo com 3+ caracteres ou uma data.");
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    setSelected(null);
    setOverrideResult(null);
    try {
      const params = new URLSearchParams({ scope: "support", status: OrderStatus.OUT_FOR_DELIVERY });
      for (const [key, value] of Object.entries(fields)) {
        if (value.trim()) params.set(key, value.trim());
      }
      if (date) params.set("date", date);
      const res = await fetch(`/api/orders?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error || "Erro ao buscar pedidos.");
        return;
      }
      setResults(data.orders ?? []);
      setSearched(true);
    } catch {
      setSearchError("Erro de conexão.");
    } finally {
      setSearchLoading(false);
    }
  }

  function selectOrder(order: SearchResult) {
    setSelected(order);
    setReason("");
    setDetails("");
    setOverrideError(null);
    setOverrideResult(null);
  }

  async function handleOverride() {
    if (!selected || !reason) {
      setOverrideError("Selecione um motivo.");
      return;
    }
    if (needsDetails && details.trim().length < 10) {
      setOverrideError("Detalhe deve ter ao menos 10 caracteres.");
      return;
    }
    setOverrideLoading(true);
    setOverrideError(null);
    setOverrideResult(null);
    try {
      const res = await fetch(`/api/orders/${selected.id}/otp-override`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, details: details.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json();
        setOverrideError(body.error || "Erro ao realizar override");
        return;
      }
      setOverrideResult("Override realizado com sucesso. O pedido foi marcado como entregue.");
      setResults((prev) => prev.filter((o) => o.id !== selected.id));
      setSelected(null);
      setReason("");
      setDetails("");
    } catch {
      setOverrideError("Erro de conexão.");
    } finally {
      setOverrideLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold font-heading">Override de OTP</h1>
        <p className="text-sm text-muted-foreground">
          Busque o pedido em rota de entrega e confirme a entrega sem o código, informando o motivo.
        </p>
      </div>

      <form onSubmit={handleSearch} className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-3">
        <p className="text-xs text-muted-foreground">Preencha ao menos um campo (3+ caracteres) ou a data de entrega.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome</label>
            <Input placeholder="Maria Silva" value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl border-0 bg-[#e1e3e4]" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Telefone</label>
            <Input placeholder="(11) 91234-5678" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-xl border-0 bg-[#e1e3e4]" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">E-mail</label>
            <Input placeholder="maria@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl border-0 bg-[#e1e3e4]" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CPF</label>
            <Input placeholder="123.456.789-00" value={cpf} onChange={(e) => setCpf(e.target.value)} className="rounded-xl border-0 bg-[#e1e3e4]" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ID do pedido</label>
            <Input placeholder="Ex: abc-123" value={orderId} onChange={(e) => setOrderId(e.target.value)} className="rounded-xl border-0 bg-[#e1e3e4]" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Data de entrega</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl border-0 bg-[#e1e3e4]" />
          </div>
        </div>
        {searchError && <div className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{searchError}</div>}
        <Button type="submit" disabled={searchLoading} className="w-full rounded-xl bg-[#00E0FF] hover:bg-[#00E0FF]/90 text-[#001735] font-semibold shadow-none active:scale-[0.98]">
          {searchLoading ? "Buscando..." : "Buscar pedidos em rota"}
        </Button>
      </form>

      {searched && results.length === 0 && (
        <p className="text-muted-foreground text-sm">Nenhum pedido em rota de entrega encontrado para essa busca.</p>
      )}

      {results.length > 0 && !selected && (
        <div className="space-y-3">
          {results.map((order) => (
            <button key={order.id} onClick={() => selectOrder(order)} className="w-full text-left">
              <div className="rounded-2xl bg-white/95 p-3 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm hover:shadow-[0_4px_16px_rgba(0,26,64,0.10)] transition-shadow space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm font-heading">{order.consumer_name}</p>
                  <StatusPill status={order.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Pedido #{order.id} — {order.consumer_phone} — {formatDate(order.delivery_date)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold font-heading">{selected.consumer_name}</p>
              <p className="text-xs text-muted-foreground">
                Pedido #{selected.id} — {selected.consumer_phone} — {formatDate(selected.delivery_date)}
              </p>
            </div>
            <Button onClick={() => setSelected(null)} className="rounded-xl border-0 bg-[#e1e3e4] text-foreground hover:bg-[#d1d3d4] text-xs h-8 px-3">
              Trocar pedido
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Use esta função apenas quando o consumidor não conseguir fornecer o código OTP. Todas as ações são registradas na auditoria.
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

          {needsDetails && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detalhe *</label>
              <Textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="h-24 rounded-xl border-0 bg-[#e1e3e4] px-3 py-2 text-sm resize-none"
                placeholder="Descreva o motivo do override..."
              />
            </div>
          )}

          {overrideError && <div className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{overrideError}</div>}
          {overrideResult && <div className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700">{overrideResult}</div>}

          <Button
            className="w-full rounded-xl bg-[#00E0FF] hover:bg-[#00E0FF]/90 text-[#001735] font-semibold shadow-none active:scale-[0.98]"
            disabled={overrideLoading || !reason || (needsDetails && details.trim().length < 10)}
            onClick={handleOverride}
          >
            {overrideLoading ? "Processando..." : "Confirmar Override"}
          </Button>
        </div>
      )}
    </div>
  );
}
