"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import { PageHeader } from "@/src/components/shared/page-header";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { addDaysIso, todayIso } from "@/src/lib/datetime";
import { useOpsDistributors } from "@/src/hooks/ops/use-ops-zones";

/**
 * Grupos de eventos em linguagem de operação. O CSV continua trazendo o código
 * técnico (event_type) — aqui só escolhemos o que entra no arquivo.
 */
const EVENT_GROUPS = [
  {
    id: "orders",
    label: "Pedidos",
    types: [
      "ORDER_CREATED", "ORDER_PRICING_FINALIZED", "ORDER_CONFIRMED", "ORDER_CANCELLED",
      "ORDER_RECEIVED_BY_DISTRIBUTOR", "ORDER_ACCEPTED_BY_DISTRIBUTOR", "ORDER_REJECTED_BY_DISTRIBUTOR",
    ],
  },
  {
    id: "delivery",
    label: "Entrega",
    types: [
      "ORDER_DRIVER_ASSIGNED", "DISPATCH_CHECKLIST_COMPLETED", "ORDER_DISPATCHED", "ORDER_DELIVERED",
      "REDELIVERY_REQUIRED", "REDELIVERY_SCHEDULED", "RECEIPT_ISSUED", "RECEIPT_PRINTED",
    ],
  },
  {
    id: "otp",
    label: "Código de entrega",
    types: ["OTP_GENERATED", "OTP_SENT", "OTP_VALIDATION_ATTEMPTED", "OTP_OVERRIDE"],
  },
  {
    id: "payments",
    label: "Pagamentos",
    types: [
      "PAYMENT_CREATED", "PAYMENT_CAPTURED", "PAYMENT_FAILED", "PAYMENT_EXPIRED",
      "PAYMENT_REFUNDED", "PAYMENT_REFUND_FAILED",
    ],
  },
  {
    id: "bottles",
    label: "Vasilhames e caução",
    types: [
      "BOTTLE_EXCHANGE_RECORDED", "EMPTY_NOT_COLLECTED", "DEPOSIT_HELD", "DEPOSIT_REFUND_INITIATED",
      "DEPOSIT_REFUNDED", "DEPOSIT_BOTTLES_LOANED", "DEPOSIT_BOTTLES_RETURNED", "DEPOSIT_BOTTLES_WRITTEN_OFF",
      "DEPOSIT_PROGRAM_ENABLED", "DEPOSIT_PROGRAM_DISABLED", "DAILY_RECONCILIATION_CLOSED",
    ],
  },
  {
    id: "registry",
    label: "Cadastros",
    types: [
      "DISTRIBUTOR_CREATED", "DISTRIBUTOR_UPDATED", "DRIVER_CREATED", "DRIVER_UPDATED",
      "DRIVER_LINKED_TO_DISTRIBUTOR", "ZONE_CREATED", "ZONE_UPDATED", "ZONE_TRANSFERRED", "ZONE_COVERAGE_CHANGED",
    ],
  },
] as const;

const PRESETS = [
  { id: "7", label: "7 dias", days: 7 },
  { id: "30", label: "30 dias", days: 30 },
  { id: "90", label: "90 dias", days: 90 },
] as const;

const ALL = "ALL";

export default function AuditExportPage() {
  const today = todayIso();
  const [startDate, setStartDate] = useState(() => addDaysIso(today, -6));
  const [endDate, setEndDate] = useState(today);
  const [groups, setGroups] = useState<string[]>([]);
  const [distributorId, setDistributorId] = useState(ALL);
  const [loading, setLoading] = useState(false);
  const { distributors } = useOpsDistributors();

  const activePreset = PRESETS.find((p) => endDate === today && startDate === addDaysIso(today, -(p.days - 1)))?.id ?? "";
  const invalidRange = !startDate || !endDate || startDate > endDate;

  async function handleExport() {
    if (invalidRange) {
      toast.error("Confira o período: a data inicial precisa ser antes da final.");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (distributorId !== ALL) params.set("distributorId", distributorId);
      // Express 5 usa o parser simples: chave repetida vira array (sem "[]").
      EVENT_GROUPS.filter((g) => groups.includes(g.id))
        .flatMap((g) => g.types)
        .forEach((type) => params.append("eventTypes", type));

      const res = await fetch(`/api/ops/audit/export?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? body?.message ?? "Não foi possível gerar o arquivo");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `auditoria-${startDate}-a-${endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Arquivo baixado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o arquivo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Auditoria"
        description="Baixe o histórico de eventos (planilha CSV) para conferência ou fiscalização."
      />

      <div className="space-y-5 px-4 pb-4">
        <section className="space-y-3 rounded-2xl border border-hairline bg-card p-4">
          <h2 className="font-heading text-base font-semibold">Período</h2>
          <ToggleGroup
            type="single"
            variant="outline"
            value={activePreset}
            onValueChange={(v) => {
              const preset = PRESETS.find((p) => p.id === v);
              if (!preset) return;
              setEndDate(today);
              setStartDate(addDaysIso(today, -(preset.days - 1)));
            }}
            className="w-full"
          >
            {PRESETS.map((p) => (
              <ToggleGroupItem key={p.id} value={p.id} className="h-10 flex-1">
                {p.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="grid grid-cols-2 gap-3">
            <label className="min-w-0 space-y-1.5">
              <span className="text-sm font-medium">De</span>
              <Input type="date" value={startDate} max={endDate || today} onChange={(e) => setStartDate(e.target.value)} className="h-11 w-full min-w-0 rounded-xl" />
            </label>
            <label className="min-w-0 space-y-1.5">
              <span className="text-sm font-medium">Até</span>
              <Input type="date" value={endDate} min={startDate} max={today} onChange={(e) => setEndDate(e.target.value)} className="h-11 w-full min-w-0 rounded-xl" />
            </label>
          </div>
          {invalidRange ? <p className="text-sm text-destructive">A data inicial precisa ser antes da final.</p> : null}
        </section>

        <section className="space-y-3 rounded-2xl border border-hairline bg-card p-4">
          <div>
            <h2 className="font-heading text-base font-semibold">O que incluir</h2>
            <p className="text-sm text-muted-foreground">Sem nada marcado, vão todos os eventos.</p>
          </div>
          <ToggleGroup
            type="multiple"
            variant="outline"
            value={groups}
            onValueChange={setGroups}
            className="flex w-full flex-wrap justify-start gap-2"
          >
            {EVENT_GROUPS.map((g) => (
              <ToggleGroupItem
                key={g.id}
                value={g.id}
                className="h-10 flex-none rounded-md! border px-4 data-[state=on]:border-primary data-[state=on]:bg-secondary data-[state=on]:text-primary"
              >
                {g.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </section>

        <section className="space-y-3 rounded-2xl border border-hairline bg-card p-4">
          <div>
            <h2 className="font-heading text-base font-semibold">Distribuidora</h2>
            <p className="text-sm text-muted-foreground">Ao escolher uma, só entram eventos de pedidos dela.</p>
          </div>
          <Select value={distributorId} onValueChange={setDistributorId}>
            <SelectTrigger className="h-11 w-full rounded-xl" aria-label="Distribuidora">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {distributors.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>
      </div>

      <StickyActionBar>
        <Button variant="cta" size="xl" disabled={loading || invalidRange} onClick={handleExport}>
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
          Baixar CSV
        </Button>
      </StickyActionBar>
    </div>
  );
}
