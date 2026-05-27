"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  Scale,
} from "lucide-react";
import { toast } from "sonner";
import type { InventoryItemType } from "@xua/shared/enums";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { ApiError, api } from "@/src/lib/api-client";
import { formatInventoryQuantity, INVENTORY_ITEM_TYPE_LABEL } from "@/src/lib/inventory-ui";
import { cn, formatDate, formatTime } from "@/src/lib/utils";

const EMPTY_COUNTS: Record<string, string> = {};

interface Pagination {
  limit: number;
  offset: number;
  total: number;
}

interface SessionListRow {
  id: string;
  status: "OPEN" | "CLOSED";
  opened_at: string;
  closed_at: string | null;
  item_count: number;
}

interface SessionItem {
  id: string;
  inventory_item_id: string;
  item: {
    id: string;
    code: string;
    name: string;
    type: InventoryItemType;
    unit_label: string;
  };
  snapshot_quantity: number;
  counted_quantity: number | null;
  delta: number | null;
  adjustment_movement_id: string | null;
}

interface SessionDetail {
  id: string;
  distributor_name: string;
  status: "OPEN" | "CLOSED";
  justification: string | null;
  opened_at: string;
  closed_at: string | null;
  items: SessionItem[];
}

interface SessionListResponse {
  sessions: SessionListRow[];
  pagination: Pagination;
}

interface SessionDetailResponse {
  session: SessionDetail;
  adjusted_count?: number;
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  return fallback;
}

export default function DistributorInventoryReconciliationPage() {
  const queryClient = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [countEdits, setCountEdits] = useState<{ sessionId: string | null; values: Record<string, string> }>({
    sessionId: null,
    values: {},
  });
  const [justificationEdit, setJustificationEdit] = useState<{ sessionId: string | null; value: string }>({
    sessionId: null,
    value: "",
  });

  const openSessionsQuery = useQuery<SessionListResponse>({
    queryKey: ["distributor-inventory-reconciliation-open"],
    queryFn: () =>
      api.get("/api/distributor/inventory/reconciliation-sessions?status=OPEN&limit=1&offset=0"),
  });

  const resolvedSessionId = selectedSessionId ?? openSessionsQuery.data?.sessions[0]?.id ?? null;

  const sessionQuery = useQuery<SessionDetailResponse>({
    queryKey: ["distributor-inventory-reconciliation-session", resolvedSessionId],
    queryFn: () => api.get(`/api/distributor/inventory/reconciliation-sessions/${resolvedSessionId}`),
    enabled: Boolean(resolvedSessionId),
  });

  const session = sessionQuery.data?.session ?? null;
  const activeCounts = session && countEdits.sessionId === session.id ? countEdits.values : EMPTY_COUNTS;
  const currentJustification =
    session && justificationEdit.sessionId === session.id
      ? justificationEdit.value
      : session?.justification ?? "";

  const deltas = useMemo(() => {
    if (!session) return [];
    return session.items.map((item) => {
      const value = activeCounts[item.inventory_item_id] ?? String(item.counted_quantity ?? item.snapshot_quantity);
      const counted = value === "" || value == null ? NaN : Number(value);
      return {
        item,
        counted,
        delta: Number.isFinite(counted) ? counted - item.snapshot_quantity : NaN,
      };
    });
  }, [activeCounts, session]);

  const hasDivergence = deltas.some((entry) => Number.isFinite(entry.delta) && entry.delta !== 0);
  const invalidCounts = deltas.some(
    (entry) => !Number.isInteger(entry.counted) || entry.counted < 0
  );
  const totalDelta = deltas.reduce(
    (sum, entry) => sum + (Number.isFinite(entry.delta) ? entry.delta : 0),
    0
  );

  const openMutation = useMutation({
    mutationFn: () => api.post<SessionDetailResponse>("/api/distributor/inventory/reconciliation-sessions", {}),
    onSuccess: (result) => {
      setSelectedSessionId(result.session.id);
      setCountEdits({ sessionId: result.session.id, values: {} });
      setJustificationEdit({ sessionId: result.session.id, value: "" });
      void queryClient.invalidateQueries({ queryKey: ["distributor-inventory-reconciliation-open"] });
      toast.success("Sessão aberta");
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Erro ao abrir sessão")),
  });

  const closeMutation = useMutation({
    mutationFn: (payload: unknown) =>
      api.post<SessionDetailResponse>(
        `/api/distributor/inventory/reconciliation-sessions/${session?.id}/close`,
        payload
      ),
    onSuccess: (result) => {
      setSelectedSessionId(result.session.id);
      setCountEdits({ sessionId: result.session.id, values: {} });
      setJustificationEdit({ sessionId: result.session.id, value: result.session.justification ?? "" });
      void queryClient.invalidateQueries({ queryKey: ["distributor-inventory-reconciliation-open"] });
      void queryClient.invalidateQueries({ queryKey: ["distributor-inventory-reconciliation-session"] });
      void queryClient.invalidateQueries({ queryKey: ["distributor-inventory-balances"] });
      void queryClient.invalidateQueries({ queryKey: ["distributor-inventory-movements"] });
      toast.success(`Sessão fechada com ${result.adjusted_count ?? 0} ajuste(s)`);
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Erro ao fechar sessão")),
  });

  function closeSession() {
    if (!session || session.status !== "OPEN") return;

    if (invalidCounts) {
      toast.error("Contagens devem ser inteiras e não negativas");
      return;
    }

    closeMutation.mutate({
      justification: currentJustification.trim() || undefined,
      counts: deltas.map((entry) => ({
        inventory_item_id: entry.item.inventory_item_id,
        counted_quantity: entry.counted,
      })),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 px-0 text-muted-foreground hover:bg-transparent">
            <Link href="/distributor/inventory">
              <ArrowLeft className="h-4 w-4" />
              Estoque
            </Link>
          </Button>
          <h1 className="text-lg font-bold font-heading text-foreground">Conciliação física</h1>
          <p className="text-sm text-muted-foreground">{session?.distributor_name ?? "Distribuidora"}</p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={openMutation.isPending || openSessionsQuery.isLoading || Boolean(session && session.status === "OPEN")}
          onClick={() => openMutation.mutate()}
          className="rounded-xl bg-[#00E0FF] text-[#001735] shadow-none hover:bg-[#00E0FF]/90"
        >
          {openMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
          Abrir sessão
        </Button>
      </div>

      {openSessionsQuery.isError ? (
        <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-red-100">
          <p className="text-sm font-semibold text-red-700">Erro ao consultar sessão aberta</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => openSessionsQuery.refetch()}>
            <RefreshCw className="h-4 w-4" />
            Recarregar
          </Button>
        </div>
      ) : openSessionsQuery.isLoading || sessionQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]" />
          ))}
        </div>
      ) : !session ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
          <Scale className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold text-foreground">Nenhuma sessão aberta</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
              <p className={cn("mt-2 text-2xl font-bold", session.status === "OPEN" ? "text-amber-600" : "text-green-700")}>
                {session.status === "OPEN" ? "Aberta" : "Fechada"}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Itens</p>
              <p className="mt-2 text-2xl font-bold text-[#0d1b2f]">{session.items.length}</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delta total</p>
              <p className={cn("mt-2 text-2xl font-bold", totalDelta === 0 ? "text-green-700" : "text-red-600")}>
                {totalDelta > 0 ? "+" : ""}{totalDelta.toLocaleString("pt-BR")}
              </p>
            </div>
          </div>

          <section className="space-y-3 rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-sm font-bold text-foreground">Contagens</h2>
              <span className="text-xs text-muted-foreground">
                Aberta em {formatDate(session.opened_at)} {formatTime(session.opened_at)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-[#e1e3e4] text-left">
                    <th className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</th>
                    <th className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo</th>
                    <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Snapshot</th>
                    <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contagem</th>
                    <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {deltas.map(({ item, delta }) => (
                    <tr key={item.id} className="border-b border-[#e1e3e4] last:border-0">
                      <td className="py-3">
                        <p className="font-semibold text-[#0d1b2f]">{item.item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.item.code}</p>
                      </td>
                      <td className="py-3 text-muted-foreground">{INVENTORY_ITEM_TYPE_LABEL[item.item.type]}</td>
                      <td className="py-3 text-right font-semibold">
                        {formatInventoryQuantity(item.snapshot_quantity, item.item.unit_label)}
                      </td>
                      <td className="py-3">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          disabled={session.status !== "OPEN"}
                          value={activeCounts[item.inventory_item_id] ?? String(item.counted_quantity ?? item.snapshot_quantity)}
                          onChange={(event) => {
                            const sessionId = session.id;
                            const value = event.target.value;
                            setCountEdits((current) => {
                              const values = current.sessionId === sessionId ? current.values : EMPTY_COUNTS;
                              return {
                                sessionId,
                                values: { ...values, [item.inventory_item_id]: value },
                              };
                            });
                          }}
                          className="ml-auto h-9 w-28 rounded-xl border-[#d9dde3] text-right"
                        />
                      </td>
                      <td className="py-3 text-right">
                        <span
                          className={cn(
                            "inline-flex min-w-16 items-center justify-end gap-1 rounded-full px-2 py-1 text-xs font-semibold",
                            delta === 0
                              ? "bg-green-50 text-green-700"
                              : Number.isFinite(delta)
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-700"
                          )}
                        >
                          {delta === 0 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                          {Number.isFinite(delta) ? `${delta > 0 ? "+" : ""}${delta}` : "Inválido"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
            <label className="block text-sm font-semibold font-heading text-foreground" htmlFor="justification">
              Justificativa
            </label>
            <Textarea
              id="justification"
              value={currentJustification}
              disabled={session.status !== "OPEN"}
              onChange={(event) => setJustificationEdit({ sessionId: session.id, value: event.target.value })}
              placeholder="Motivo da divergência"
              className="min-h-24 rounded-xl border-[#d9dde3] bg-white text-sm"
              maxLength={500}
            />
            {hasDivergence ? (
              <p className="text-xs font-medium text-red-600">Divergência em relação ao snapshot da sessão.</p>
            ) : null}
            {session.closed_at ? (
              <p className="text-xs text-muted-foreground">
                Fechada em {formatDate(session.closed_at)} {formatTime(session.closed_at)}
              </p>
            ) : null}
          </section>

          <Button
            type="button"
            className="w-full rounded-xl bg-[#00E0FF] text-[#001735] shadow-none hover:bg-[#00E0FF]/90"
            disabled={session.status !== "OPEN" || closeMutation.isPending}
            onClick={closeSession}
          >
            {closeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            Fechar conciliação
          </Button>
        </>
      )}
    </div>
  );
}
