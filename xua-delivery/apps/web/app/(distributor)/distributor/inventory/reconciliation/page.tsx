"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, Minus, Plus, RefreshCw, Scale } from "lucide-react";
import { toast } from "sonner";
import type { InventoryItemType } from "@xua/shared/enums";

import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { ConfirmAction } from "@/src/components/shared/confirm-action";
import { EmptyState } from "@/src/components/shared/empty-state";
import { PageHeader } from "@/src/components/shared/page-header";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
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

  const rows = useMemo(() => {
    if (!session) return [];
    return session.items.map((item) => {
      const value = activeCounts[item.inventory_item_id] ?? String(item.counted_quantity ?? item.snapshot_quantity);
      const counted = value === "" || value == null ? NaN : Number(value);
      const previewDelta = Number.isFinite(counted) ? counted - item.snapshot_quantity : NaN;
      return {
        item,
        counted,
        previewDelta,
        displayDelta: session.status === "OPEN" ? previewDelta : (item.delta ?? NaN),
      };
    });
  }, [activeCounts, session]);

  const invalidCounts = rows.some(
    (entry) => !Number.isInteger(entry.counted) || entry.counted < 0
  );
  const totalDelta = rows.reduce(
    (sum, entry) => sum + (Number.isFinite(entry.displayDelta) ? entry.displayDelta : 0),
    0
  );

  const openMutation = useMutation({
    mutationFn: () => api.post<SessionDetailResponse>("/api/distributor/inventory/reconciliation-sessions", {}),
    onSuccess: (result) => {
      setSelectedSessionId(result.session.id);
      setCountEdits({ sessionId: result.session.id, values: {} });
      setJustificationEdit({ sessionId: result.session.id, value: "" });
      void queryClient.invalidateQueries({ queryKey: ["distributor-inventory-reconciliation-open"] });
      toast.success("Conferência iniciada. Conte cada item.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Erro ao iniciar a conferência")),
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
      toast.success(result.adjusted_count ? `Conferência finalizada · ${result.adjusted_count} ajuste(s) no estoque` : "Conferência finalizada · tudo conferia");
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Erro ao finalizar a conferência")),
  });

  function closeSession() {
    if (!session || session.status !== "OPEN") return;

    if (invalidCounts) {
      toast.error("Contagens devem ser inteiras e não negativas");
      return;
    }

    closeMutation.mutate({
      justification: currentJustification.trim() || undefined,
      counts: rows.map((entry) => ({
        inventory_item_id: entry.item.inventory_item_id,
        counted_quantity: entry.counted,
      })),
    });
  }

  const divergentCount = rows.filter((e) => Number.isFinite(e.displayDelta) && e.displayDelta !== 0).length;

  function setCount(inventoryItemId: string, value: string) {
    if (!session) return;
    const sessionId = session.id;
    setCountEdits((current) => {
      const values = current.sessionId === sessionId ? current.values : EMPTY_COUNTS;
      return { sessionId, values: { ...values, [inventoryItemId]: value } };
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        back="/distributor/inventory"
        title="Conferir contagem"
        description={
          session?.status === "OPEN"
            ? `Iniciada em ${formatDate(session.opened_at)} às ${formatTime(session.opened_at)}`
            : "Compare o estoque físico com o do sistema e corrija diferenças."
        }
      />

      <div className="space-y-4 px-4 pb-4">
        {openSessionsQuery.isError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Erro ao consultar a conferência"
            action={
              <Button variant="outline" onClick={() => openSessionsQuery.refetch()}>
                <RefreshCw /> Tentar de novo
              </Button>
            }
          />
        ) : openSessionsQuery.isLoading || sessionQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : !session ? (
          <EmptyState
            icon={Scale}
            title="Nenhuma conferência em andamento"
            description="Ao começar, o sistema guarda o saldo de cada item. Você conta o que tem na prateleira e, ao finalizar, as diferenças viram ajuste no estoque."
          />
        ) : (
          <>
            {session.status === "CLOSED" ? (
              <Alert className="border-success/30 bg-success-surface">
                <CheckCircle2 className="text-success-foreground" aria-hidden />
                <AlertDescription className="text-success-foreground">
                  Conferência finalizada{session.closed_at ? ` em ${formatDate(session.closed_at)} às ${formatTime(session.closed_at)}` : ""}.{" "}
                  {totalDelta === 0 ? "Sem diferenças." : `Ajuste total: ${totalDelta > 0 ? "+" : ""}${totalDelta}.`}
                </AlertDescription>
              </Alert>
            ) : null}

            <ul className="space-y-2">
              {rows.map(({ item, displayDelta }) => {
                const value = activeCounts[item.inventory_item_id] ?? String(item.counted_quantity ?? item.snapshot_quantity);
                const ok = displayDelta === 0;
                const valid = Number.isFinite(displayDelta);
                return (
                  <li key={item.id} className="rounded-2xl border border-hairline bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{item.item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {INVENTORY_ITEM_TYPE_LABEL[item.item.type]} · no sistema:{" "}
                          <span className="font-semibold text-foreground">{formatInventoryQuantity(item.snapshot_quantity, item.item.unit_label)}</span>
                        </p>
                      </div>
                      <span
                        className={cn(
                          "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                          ok ? "bg-success-surface text-success-foreground" : valid ? "bg-danger-surface text-destructive" : "bg-warning-surface text-warning-foreground",
                        )}
                      >
                        {ok ? <CheckCircle2 className="size-3.5" aria-hidden /> : <AlertTriangle className="size-3.5" aria-hidden />}
                        {ok ? "Confere" : valid ? `${displayDelta > 0 ? "+" : ""}${displayDelta}` : "Inválido"}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Label htmlFor={`count-${item.id}`} className="flex-1 text-sm text-muted-foreground">
                        Contado
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-touch"
                        aria-label={`Diminuir contagem de ${item.item.name}`}
                        disabled={session.status !== "OPEN" || Number(value) <= 0}
                        onClick={() => setCount(item.inventory_item_id, String(Math.max(0, Number(value || 0) - 1)))}
                      >
                        <Minus />
                      </Button>
                      <Input
                        id={`count-${item.id}`}
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        disabled={session.status !== "OPEN"}
                        value={value}
                        onChange={(e) => setCount(item.inventory_item_id, e.target.value)}
                        className="h-11 w-24 text-center font-heading text-lg font-bold"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-touch"
                        aria-label={`Aumentar contagem de ${item.item.name}`}
                        disabled={session.status !== "OPEN"}
                        onClick={() => setCount(item.inventory_item_id, String(Number(value || 0) + 1))}
                      >
                        <Plus />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {session.status === "OPEN" || session.justification ? (
              <div className="grid gap-1.5">
                <Label htmlFor="justification">
                  O que explica as diferenças? {divergentCount === 0 ? <span className="font-normal text-muted-foreground">(opcional)</span> : null}
                </Label>
                <Textarea
                  id="justification"
                  value={currentJustification}
                  disabled={session.status !== "OPEN"}
                  onChange={(e) => setJustificationEdit({ sessionId: session.id, value: e.target.value })}
                  placeholder="Ex.: 2 galões quebrados no transporte"
                  rows={3}
                  maxLength={500}
                  className="resize-none rounded-xl text-base md:text-sm"
                />
              </div>
            ) : null}
          </>
        )}
      </div>

      {!openSessionsQuery.isLoading && !sessionQuery.isLoading ? (
        <StickyActionBar
          summary={
            session?.status === "OPEN" ? (
              <span className="block text-center text-xs">
                {divergentCount === 0 ? "Tudo confere com o sistema." : `${divergentCount} ${divergentCount === 1 ? "item com diferença" : "itens com diferença"} · ajuste total ${totalDelta > 0 ? "+" : ""}${totalDelta}`}
              </span>
            ) : undefined
          }
        >
          {session?.status === "OPEN" ? (
            <ConfirmAction
              trigger={
                <Button variant="cta" size="xl" disabled={closeMutation.isPending || invalidCounts}>
                  {closeMutation.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <ClipboardCheck aria-hidden />}
                  Finalizar conferência
                </Button>
              }
              title="Finalizar a conferência?"
              description={
                divergentCount === 0
                  ? "Nenhum saldo será alterado."
                  : `${divergentCount} ${divergentCount === 1 ? "item terá o saldo ajustado" : "itens terão o saldo ajustado"} para a quantidade contada. Isso não pode ser desfeito.`
              }
              confirmLabel="Finalizar"
              onConfirm={() => closeSession()}
            />
          ) : (
            <Button variant="cta" size="xl" disabled={openMutation.isPending} onClick={() => openMutation.mutate()}>
              {openMutation.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Scale aria-hidden />}
              {session ? "Nova conferência" : "Começar conferência"}
            </Button>
          )}
        </StickyActionBar>
      ) : null}
    </div>
  );
}
