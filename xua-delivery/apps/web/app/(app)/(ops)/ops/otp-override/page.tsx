"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Loader2, Search, Truck } from "lucide-react";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { EmptyState } from "@/src/components/shared/empty-state";
import { PageHeader } from "@/src/components/shared/page-header";
import { ResponsiveDialog } from "@/src/components/shared/responsive-dialog";
import { ApiError, api } from "@/src/lib/api-client";
import { formatPhone } from "@/src/lib/format";
import { formatShortOrderId } from "@/src/lib/order-detail-format";
import { cn, formatDate } from "@/src/lib/utils";
import type { Order } from "@/src/types";

interface SearchResult extends Order {
  consumer_name: string;
  consumer_email: string;
  consumer_phone: string;
}

const REASONS = [
  { value: "confirmed_by_phone", label: "Cliente confirmou o recebimento por telefone" },
  { value: "elderly_no_smartphone", label: "Cliente sem celular para ver o código" },
  { value: "browser_technical_issue", label: "Problema técnico no app do cliente" },
  { value: "other", label: "Outro motivo" },
] as const;
type Reason = (typeof REASONS)[number]["value"];

function OtpOverrideContent() {
  const queryClient = useQueryClient();
  const preselected = useSearchParams().get("order");
  const [input, setInput] = useState(preselected ?? "");
  const [q, setQ] = useState(preselected ?? "");
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [reason, setReason] = useState<Reason | "">("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  // Sem busca: lista todas as entregas em rota (são poucas por vez).
  const query = useQuery({
    queryKey: ["otp-override", q],
    queryFn: async () => {
      const params = new URLSearchParams({ scope: "support", status: "OUT_FOR_DELIVERY" });
      if (q.length >= 3) params.set("q", q);
      return (await api.get<{ orders?: SearchResult[] }>(`/api/orders?${params}`)).orders ?? [];
    },
  });

  const needsDetails = reason === "other";
  const ready = reason !== "" && (!needsDetails || details.trim().length >= 10);

  async function confirm() {
    if (!selected || !ready) return;
    setSaving(true);
    try {
      await api.patch(`/api/orders/${selected.id}/otp-override`, { reason, details: details.trim() || undefined });
      toast.success(`Entrega de ${selected.consumer_name} confirmada sem código`);
      setSelected(null);
      setReason("");
      setDetails("");
      await queryClient.invalidateQueries({ queryKey: ["otp-override"] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível liberar a entrega");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Liberar sem código" description="Confirma a entrega quando o cliente não consegue mostrar o código." sticky>
        <form
          role="search"
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(input.trim());
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (!e.target.value) setQ("");
              }}
              placeholder="Cliente, telefone ou nº do pedido"
              aria-label="Buscar entrega em rota"
              className="h-11 rounded-xl pl-9"
            />
          </div>
          <Button type="submit" variant="outline" size="xl">
            Buscar
          </Button>
        </form>
      </PageHeader>

      <div className="space-y-3 px-4 pb-6">
        <Alert className="border-warning/30 bg-warning-surface">
          <KeyRound className="text-warning-foreground" aria-hidden />
          <AlertDescription className="text-warning-foreground">
            Use só depois de confirmar com o cliente que a água chegou. A liberação fica registrada na auditoria.
          </AlertDescription>
        </Alert>

        {query.error ? (
          <Alert variant="destructive">
            <AlertDescription>{query.error instanceof ApiError ? query.error.message : "Erro na busca"}</AlertDescription>
          </Alert>
        ) : null}

        <h2 className="text-sm font-semibold text-foreground">{q ? `Entregas em rota para “${q}”` : "Entregas em rota agora"}</h2>
        {query.isLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : (query.data ?? []).length === 0 ? (
          <EmptyState icon={Truck} title="Nenhuma entrega em rota encontrada" description="Só pedidos que saíram para entrega podem ser liberados." />
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
            {(query.data ?? []).map((order) => (
              <li key={order.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="truncate font-semibold text-foreground">{order.consumer_name}</span>
                    <span className="font-mono text-xs text-muted-foreground">#{formatShortOrderId(order.id)}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(order.delivery_date)}
                    {order.consumer_phone ? ` · ${formatPhone(order.consumer_phone)}` : ""}
                  </p>
                </div>
                <Button variant="soft" size="lg" onClick={() => setSelected(order)}>
                  Liberar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ResponsiveDialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setReason("");
            setDetails("");
          }
        }}
        title={selected ? `Liberar entrega de ${selected.consumer_name}` : "Liberar entrega"}
        description="O pedido será marcado como entregue sem o código do cliente."
        footer={
          <Button variant="cta" size="xl" disabled={!ready || saving} onClick={confirm}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
            Confirmar entrega
          </Button>
        }
      >
        <div className="grid gap-3">
          <RadioGroup value={reason} onValueChange={(v) => setReason(v as Reason)} aria-label="Motivo">
            {REASONS.map((r) => (
              <Label
                key={r.value}
                htmlFor={`r-${r.value}`}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border bg-card px-3 font-normal",
                  reason === r.value ? "border-primary ring-1 ring-primary" : "border-hairline",
                )}
              >
                {r.label}
                <RadioGroupItem id={`r-${r.value}`} value={r.value} aria-label={r.label} />
              </Label>
            ))}
          </RadioGroup>
          <div className="grid gap-1.5">
            <Label htmlFor="ov-details">
              Detalhes {needsDetails ? null : <span className="font-normal text-muted-foreground">(opcional)</span>}
            </Label>
            <Textarea
              id="ov-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              placeholder={needsDetails ? "Ao menos 10 caracteres" : "Ex.: falei com a cliente às 10h"}
              className="resize-none text-base md:text-sm"
            />
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}

export default function OtpOverridePage() {
  return (
    <Suspense fallback={null}>
      <OtpOverrideContent />
    </Suspense>
  );
}
