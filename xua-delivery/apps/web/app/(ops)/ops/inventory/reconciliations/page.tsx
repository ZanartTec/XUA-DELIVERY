"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Eye,
  PackageSearch,
  RefreshCw,
} from "lucide-react";
import type { InventoryItemType } from "@xua/shared/enums";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { api } from "@/src/lib/api-client";
import {
  buildInventoryQuery,
  formatInventoryQuantity,
  INVENTORY_ITEM_TYPE_LABEL,
  type ReconciliationStatusFilter,
} from "@/src/lib/inventory-ui";
import { cn, formatDate, formatTime } from "@/src/lib/utils";

interface Pagination {
  limit: number;
  offset: number;
  total: number;
}

interface DistributorOptionResponse {
  distributors: Array<{ id: string; name: string }>;
}

interface SessionListRow {
  id: string;
  distributor_id: string;
  distributor_name: string;
  status: "OPEN" | "CLOSED";
  opened_by: string;
  closed_by: string | null;
  justification: string | null;
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
  distributor_id: string;
  distributor_name: string;
  status: "OPEN" | "CLOSED";
  opened_by: string;
  closed_by: string | null;
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
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="rounded-2xl bg-white p-6 text-center shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
      <PackageSearch className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
    </div>
  );
}

export default function OpsInventoryReconciliationsPage() {
  const [distributorId, setDistributorId] = useState("ALL");
  const [status, setStatus] = useState<ReconciliationStatusFilter>("ALL");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const distributorOptionsQuery = useQuery<DistributorOptionResponse>({
    queryKey: ["ops-inventory-session-distributor-options"],
    queryFn: () => api.get("/api/ops/inventory/distributors"),
  });

  const sessionsQuery = useQuery<SessionListResponse>({
    queryKey: ["ops-inventory-reconciliation-sessions", distributorId, status, start, end, offset],
    queryFn: () => {
      const query = buildInventoryQuery({
        distributor_id: distributorId === "ALL" ? undefined : distributorId,
        status: status === "ALL" ? undefined : status,
        start: start || undefined,
        end: end || undefined,
        limit: "20",
        offset: String(offset),
      });
      return api.get(`/api/ops/inventory/reconciliation-sessions?${query}`);
    },
  });

  const detailQuery = useQuery<SessionDetailResponse>({
    queryKey: ["ops-inventory-reconciliation-session", selectedSessionId],
    queryFn: () => api.get(`/api/ops/inventory/reconciliation-sessions/${selectedSessionId}`),
    enabled: Boolean(selectedSessionId),
  });

  const distributorOptions = useMemo(() => {
    return distributorOptionsQuery.data?.distributors ?? [];
  }, [distributorOptionsQuery.data?.distributors]);

  const sessions = sessionsQuery.data?.sessions ?? [];
  const selectedSession = detailQuery.data?.session ?? null;
  const selectedTotalDelta = selectedSession?.items.reduce(
    (sum, item) => sum + (item.delta ?? 0),
    0
  ) ?? 0;
  const hasNext = Boolean(
    sessionsQuery.data && offset + sessionsQuery.data.pagination.limit < sessionsQuery.data.pagination.total
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 px-0 text-muted-foreground hover:bg-transparent">
            <Link href="/ops/inventory">
              <ArrowLeft className="h-4 w-4" />
              Estoque
            </Link>
          </Button>
          <h1 className="text-lg font-bold font-heading text-foreground">Conciliações de estoque</h1>
          <p className="text-sm text-muted-foreground">Sessões físicas por distribuidora</p>
        </div>
      </div>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr]">
          <Select
            value={distributorId}
            onValueChange={(value) => {
              setDistributorId(value);
              setOffset(0);
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-xl border-[#d9dde3]">
              <SelectValue placeholder="Distribuidora" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              {distributorOptions.map((distributor) => (
                <SelectItem key={distributor.id} value={distributor.id}>
                  {distributor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as ReconciliationStatusFilter);
              setOffset(0);
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-xl border-[#d9dde3]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os status</SelectItem>
              <SelectItem value="OPEN">Aberta</SelectItem>
              <SelectItem value="CLOSED">Fechada</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={start}
            onChange={(event) => {
              setStart(event.target.value);
              setOffset(0);
            }}
            className="h-10 rounded-xl border-[#d9dde3]"
          />
          <Input
            type="date"
            value={end}
            onChange={(event) => {
              setEnd(event.target.value);
              setOffset(0);
            }}
            className="h-10 rounded-xl border-[#d9dde3]"
          />
        </div>

        {sessionsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-xl bg-[#eef0f3]" />
            ))}
          </div>
        ) : sessionsQuery.isError ? (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">Erro ao carregar sessões</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => sessionsQuery.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Recarregar
            </Button>
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState title="Nenhuma sessão encontrada" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-[#e1e3e4] text-left">
                  <th className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Distribuidora</th>
                  <th className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                  <th className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Abertura</th>
                  <th className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fechamento</th>
                  <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Itens</th>
                  <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className="border-b border-[#e1e3e4] last:border-0">
                    <td className="py-3 font-semibold text-[#0d1b2f]">{session.distributor_name}</td>
                    <td className="py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
                          session.status === "OPEN" ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"
                        )}
                      >
                        {session.status === "OPEN" ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {session.status === "OPEN" ? "Aberta" : "Fechada"}
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground">{formatDate(session.opened_at)} {formatTime(session.opened_at)}</td>
                    <td className="py-3 text-muted-foreground">
                      {session.closed_at ? `${formatDate(session.closed_at)} ${formatTime(session.closed_at)}` : "-"}
                    </td>
                    <td className="py-3 text-right font-semibold">{session.item_count}</td>
                    <td className="py-3 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => setSelectedSessionId(session.id)}
                      >
                        <Eye className="h-4 w-4" />
                        Ver
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={offset === 0 || sessionsQuery.isFetching}
            onClick={() => setOffset((current) => Math.max(0, current - 20))}
          >
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            {sessionsQuery.data ? `${offset + 1}-${Math.min(offset + sessions.length, sessionsQuery.data.pagination.total)} de ${sessionsQuery.data.pagination.total}` : "-"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasNext || sessionsQuery.isFetching}
            onClick={() => setOffset((current) => current + 20)}
          >
            Próxima
          </Button>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] ring-1 ring-[#e4e8f1]">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-sm font-bold text-foreground">Detalhe da sessão</h2>
        </div>

        {!selectedSessionId ? (
          <EmptyState title="Selecione uma sessão" />
        ) : detailQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-xl bg-[#eef0f3]" />
            ))}
          </div>
        ) : detailQuery.isError ? (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">Erro ao carregar detalhe</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => detailQuery.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Recarregar
            </Button>
          </div>
        ) : selectedSession ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-[#e4e8f1] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Distribuidora</p>
                <p className="mt-1 font-semibold text-[#0d1b2f]">{selectedSession.distributor_name}</p>
              </div>
              <div className="rounded-xl border border-[#e4e8f1] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                <p className={cn("mt-1 font-semibold", selectedSession.status === "OPEN" ? "text-amber-700" : "text-green-700")}>
                  {selectedSession.status === "OPEN" ? "Aberta" : "Fechada"}
                </p>
              </div>
              <div className="rounded-xl border border-[#e4e8f1] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delta total</p>
                <p className={cn("mt-1 font-semibold", selectedTotalDelta === 0 ? "text-green-700" : "text-red-600")}>
                  {selectedTotalDelta > 0 ? "+" : ""}{selectedTotalDelta.toLocaleString("pt-BR")}
                </p>
              </div>
            </div>

            {selectedSession.justification ? (
              <div className="rounded-xl border border-[#e4e8f1] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Justificativa</p>
                <p className="mt-1 text-sm text-[#0d1b2f]">{selectedSession.justification}</p>
              </div>
            ) : null}

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
                  {selectedSession.items.map((item) => (
                    <tr key={item.id} className="border-b border-[#e1e3e4] last:border-0">
                      <td className="py-3">
                        <p className="font-semibold text-[#0d1b2f]">{item.item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.item.code}</p>
                      </td>
                      <td className="py-3 text-muted-foreground">{INVENTORY_ITEM_TYPE_LABEL[item.item.type]}</td>
                      <td className="py-3 text-right font-semibold">
                        {formatInventoryQuantity(item.snapshot_quantity, item.item.unit_label)}
                      </td>
                      <td className="py-3 text-right font-semibold">
                        {item.counted_quantity == null ? "-" : formatInventoryQuantity(item.counted_quantity, item.item.unit_label)}
                      </td>
                      <td className="py-3 text-right">
                        <span
                          className={cn(
                            "inline-flex min-w-16 justify-end rounded-full px-2 py-1 text-xs font-semibold",
                            (item.delta ?? 0) === 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                          )}
                        >
                          {item.delta == null ? "-" : `${item.delta > 0 ? "+" : ""}${item.delta}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
