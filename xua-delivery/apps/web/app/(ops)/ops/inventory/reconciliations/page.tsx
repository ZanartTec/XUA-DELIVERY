"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ClipboardList, RefreshCw } from "lucide-react";
import type { InventoryItemType } from "@xua/shared/enums";

import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { EmptyState } from "@/src/components/shared/empty-state";
import { PageHeader } from "@/src/components/shared/page-header";
import { ResponsiveDialog } from "@/src/components/shared/responsive-dialog";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { plural } from "@/src/lib/format";
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
  type ReconciliationStatusFilter,
} from "@/src/lib/inventory-ui";
import { cn, formatDateShort, formatTime } from "@/src/lib/utils";

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

export default function OpsInventoryReconciliationsPage() {
  const [distributorId, setDistributorId] = useState("ALL");
  const [status, setStatus] = useState<ReconciliationStatusFilter>("ALL");
  const [offset, setOffset] = useState(0);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const distributorOptionsQuery = useQuery<DistributorOptionResponse>({
    queryKey: ["ops-inventory-session-distributor-options"],
    queryFn: () => api.get("/api/ops/inventory/distributors"),
  });

  const sessionsQuery = useQuery<SessionListResponse>({
    queryKey: ["ops-inventory-reconciliation-sessions", distributorId, status, offset],
    queryFn: () => {
      const query = buildInventoryQuery({
        distributor_id: distributorId === "ALL" ? undefined : distributorId,
        status: status === "ALL" ? undefined : status,
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

  const distributorOptions = distributorOptionsQuery.data?.distributors ?? [];
  const sessions = sessionsQuery.data?.sessions ?? [];
  const total = sessionsQuery.data?.pagination.total ?? 0;
  const selectedSession = detailQuery.data?.session ?? null;
  const divergentItems = selectedSession?.items.filter((item) => (item.delta ?? 0) !== 0).length ?? 0;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader back="/ops/inventory" title="Conferências de estoque" description="Contagens físicas feitas pelas distribuidoras." sticky>
        <div className="space-y-2">
          <Select
            value={distributorId}
            onValueChange={(value) => {
              setDistributorId(value);
              setOffset(0);
            }}
          >
            <SelectTrigger className="h-11 w-full rounded-xl" aria-label="Distribuidora">
              <SelectValue placeholder="Distribuidora" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas as distribuidoras</SelectItem>
              {distributorOptions.map((distributor) => (
                <SelectItem key={distributor.id} value={distributor.id}>
                  {distributor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs
            value={status}
            onValueChange={(value) => {
              setStatus(value as ReconciliationStatusFilter);
              setOffset(0);
            }}
          >
            <TabsList className="grid h-10 w-full grid-cols-3">
              <TabsTrigger value="ALL">Todas</TabsTrigger>
              <TabsTrigger value="OPEN">Em aberto</TabsTrigger>
              <TabsTrigger value="CLOSED">Fechadas</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </PageHeader>

      <div className="space-y-3 px-4 pb-4">
        {sessionsQuery.isLoading ? (
          <Skeleton className="h-56 rounded-2xl" />
        ) : sessionsQuery.isError ? (
          <div className="rounded-2xl bg-danger-surface p-4">
            <p className="text-sm font-semibold text-destructive">Não foi possível carregar as conferências.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => sessionsQuery.refetch()}>
              <RefreshCw aria-hidden /> Tentar de novo
            </Button>
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Nenhuma conferência encontrada" />
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
            {sessions.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => setSelectedSessionId(session.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-low"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{session.distributor_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDateShort(session.opened_at)} {formatTime(session.opened_at)}
                      {` · ${plural(session.item_count, "item", "itens")}`}
                    </p>
                  </div>
                  <StatusBadge
                    label={session.status === "OPEN" ? "Em aberto" : "Fechada"}
                    tone={session.status === "OPEN" ? "warning" : "success"}
                  />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        {total > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0 || sessionsQuery.isFetching}
              onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
            >
              <ChevronLeft aria-hidden /> Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              {offset + 1}–{Math.min(offset + sessions.length, total)} de {total}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + PAGE_SIZE >= total || sessionsQuery.isFetching}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
            >
              Próxima <ChevronRight aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>

      <ResponsiveDialog
        open={selectedSessionId !== null}
        onOpenChange={(open) => !open && setSelectedSessionId(null)}
        title={selectedSession ? selectedSession.distributor_name : "Conferência"}
        description={
          selectedSession
            ? `${selectedSession.status === "OPEN" ? "Em aberto" : "Fechada"} · ${
                divergentItems === 0 ? "contagem bateu com o sistema" : plural(divergentItems, "item com diferença", "itens com diferença")
              }`
            : undefined
        }
        className="sm:max-w-xl"
      >
        {detailQuery.isLoading ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : detailQuery.isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar o detalhe.</p>
        ) : selectedSession ? (
          <div className="space-y-3">
            {selectedSession.justification ? (
              <div className="rounded-xl bg-surface-low p-3">
                <p className="text-xs font-medium text-muted-foreground">Justificativa</p>
                <p className="mt-0.5 text-sm text-foreground">{selectedSession.justification}</p>
              </div>
            ) : null}
            <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
              {selectedSession.items.map((item) => {
                const delta = item.delta ?? 0;
                return (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{item.item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Sistema {formatInventoryQuantity(item.snapshot_quantity, item.item.unit_label)} · Contado{" "}
                        {item.counted_quantity == null ? "—" : formatInventoryQuantity(item.counted_quantity, item.item.unit_label)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums",
                        item.delta == null
                          ? "bg-muted text-muted-foreground"
                          : delta === 0
                            ? "bg-success/10 text-success-foreground"
                            : "bg-danger-surface text-destructive",
                      )}
                    >
                      {item.delta == null ? "—" : delta === 0 ? "ok" : `${delta > 0 ? "+" : ""}${delta}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </ResponsiveDialog>
    </div>
  );
}

const PAGE_SIZE = 20;
