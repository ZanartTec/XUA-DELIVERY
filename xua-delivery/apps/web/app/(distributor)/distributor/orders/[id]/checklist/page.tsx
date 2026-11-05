"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Truck, UserRound } from "lucide-react";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Label } from "@/src/components/ui/label";
import { Progress } from "@/src/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { Skeleton } from "@/src/components/ui/skeleton";
import { PageHeader } from "@/src/components/shared/page-header";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { useOrderDetail } from "@/src/hooks/distributor/use-order-detail";
import { useSocket } from "@/src/hooks/use-socket";
import { api, ApiError } from "@/src/lib/api-client";
import { plural } from "@/src/lib/format";
import { formatShortOrderId } from "@/src/lib/order-detail-format";
import { formatReceiptNumber, openReceipt, orderReceiptUrl, readReceiptFormat } from "@/src/lib/receipt";
import { cn } from "@/src/lib/utils";
import { OrderStatus } from "@xua/shared/enums";

type Driver = { id: string; name: string };

export default function ChecklistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { on, off } = useSocket();
  const { order, isLoading } = useOrderDetail(id);
  const drivers = useQuery({
    queryKey: ["distributor-drivers"],
    queryFn: async () => (await api.get<{ drivers?: Driver[] }>("/api/distributor/drivers")).drivers ?? [],
  });

  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [driverChoice, setDriverChoice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pedido mudou de status em outra tela (ex.: cancelado): recarrega.
  useEffect(() => {
    const handler = (...args: unknown[]) => {
      const data = args[0] as { orderId?: string } | undefined;
      if (data?.orderId === id) void queryClient.invalidateQueries({ queryKey: ["distributor-order-detail", id] });
    };
    on("order_status_changed", handler);
    return () => off("order_status_changed", handler);
  }, [id, on, off, queryClient]);

  // Conferência real: cada item do pedido + vazios + endereço/contato.
  const checklist = order
    ? [
        ...order.items.map((item, i) => ({ key: `item-${i}`, label: `${item.qty}× ${item.product_name}`, hint: "Separado e conferido" })),
        ...(order.max_bottle_charge_cents > 0 && order.bottles_full_ordered > 0
          ? [{ key: "empties", label: `Espaço para ${plural(order.bottles_full_ordered, "vazio", "vazios")}`, hint: "O motorista volta com os vasilhames de troca" }]
          : []),
        { key: "address", label: "Endereço e contato conferidos", hint: `${order.address_details.street}, ${order.address_details.number} · ${order.address_details.neighborhood}` },
      ]
    : [];

  const doneCount = checklist.filter((c) => checks[c.key]).length;
  const allChecked = checklist.length > 0 && doneCount === checklist.length;
  const selectedDriver = driverChoice ?? order?.driver_id ?? "";
  const canPrepare = order?.status === OrderStatus.ACCEPTED_BY_DISTRIBUTOR || order?.status === OrderStatus.PICKING;
  const isReady = order?.status === OrderStatus.READY_FOR_DISPATCH;
  const blocked = order != null && !canPrepare && !isReady;
  const canDispatch = (canPrepare ? allChecked : isReady) && selectedDriver !== "";

  async function handleDispatch() {
    setLoading(true);
    setError(null);
    try {
      const result = canPrepare
        ? await api.patch<{ receipt_number?: number }>(`/api/orders/${id}/dispatch-with-checklist`, { driver_id: selectedDriver })
        : await api.patch<{ receipt_number?: number }>(`/api/orders/${id}/dispatch`, { driver_id: selectedDriver });

      await queryClient.invalidateQueries({ queryKey: ["distributor-queue"] });
      // O comprovante de venda nasce junto com o despacho.
      toast.success(
        result.receipt_number ? `Pedido despachado · Comprovante Nº ${formatReceiptNumber(result.receipt_number)}` : "Pedido despachado",
        result.receipt_number
          ? { duration: 15000, action: { label: "Imprimir", onClick: () => openReceipt(orderReceiptUrl(id, readReceiptFormat())) } }
          : undefined,
      );
      router.push("/distributor/queue");
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        back={`/distributor/orders/${id}`}
        eyebrow={order ? `Pedido #${formatShortOrderId(order.id)} · ${order.consumer_name}` : undefined}
        title="Separar e despachar"
      >
        {canPrepare ? (
          <div className="space-y-1">
            <Progress value={checklist.length ? (doneCount / checklist.length) * 100 : 0} className="h-2" aria-label="Conferência" />
            <p className="text-right text-xs text-muted-foreground">
              {doneCount} de {checklist.length} conferidos
            </p>
          </div>
        ) : null}
      </PageHeader>

      <div className="space-y-4 px-4 pb-4">
        {isLoading ? (
          <Skeleton className="h-48 rounded-2xl" />
        ) : blocked ? (
          <Alert className="border-warning/30 bg-warning-surface">
            <AlertDescription className="text-warning-foreground">
              Este pedido não está mais para despachar.{" "}
              <Link href={`/distributor/orders/${id}`} className="font-semibold underline">
                Ver pedido
              </Link>
            </AlertDescription>
          </Alert>
        ) : canPrepare ? (
          <section aria-labelledby="sec-conf" className="space-y-2">
            <h2 id="sec-conf" className="text-sm font-semibold text-foreground">
              1. Confira antes de carregar
            </h2>
            <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
              {checklist.map((item) => (
                <li key={item.key}>
                  <Label
                    htmlFor={`chk-${item.key}`}
                    className={cn("flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 font-normal", checks[item.key] && "bg-success-surface/50")}
                  >
                    <Checkbox
                      id={`chk-${item.key}`}
                      checked={Boolean(checks[item.key])}
                      onCheckedChange={(v) => setChecks((prev) => ({ ...prev, [item.key]: v === true }))}
                      className="size-5"
                    />
                    <span className="min-w-0">
                      <span className="block text-base font-semibold text-foreground">{item.label}</span>
                      {item.hint ? <span className="block truncate text-xs text-muted-foreground">{item.hint}</span> : null}
                    </span>
                  </Label>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!blocked && !isLoading ? (
          <section aria-labelledby="sec-mot" className="space-y-2">
            <h2 id="sec-mot" className="text-sm font-semibold text-foreground">
              {canPrepare ? "2. " : ""}Quem leva
            </h2>
            {drivers.isLoading ? (
              <Skeleton className="h-16 rounded-2xl" />
            ) : (drivers.data ?? []).length === 0 ? (
              <Alert className="border-warning/30 bg-warning-surface">
                <AlertDescription className="text-warning-foreground">
                  Nenhum motorista ativo.{" "}
                  <Link href="/distributor/drivers" className="font-semibold underline">
                    Cadastrar motorista
                  </Link>
                </AlertDescription>
              </Alert>
            ) : (
              <RadioGroup value={selectedDriver} onValueChange={setDriverChoice} aria-label="Motorista">
                {(drivers.data ?? []).map((d) => (
                  <Label
                    key={d.id}
                    htmlFor={`drv-${d.id}`}
                    className={cn(
                      "flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border bg-card px-4 font-normal",
                      selectedDriver === d.id ? "border-primary ring-1 ring-primary" : "border-hairline",
                    )}
                  >
                    <UserRound className="size-5 text-primary" aria-hidden />
                    <span className="flex-1 text-base font-medium text-foreground">{d.name}</span>
                    <RadioGroupItem id={`drv-${d.id}`} value={d.id} aria-label={d.name} />
                  </Label>
                ))}
              </RadioGroup>
            )}
          </section>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      {!blocked ? (
        <StickyActionBar
          summary={
            !canDispatch && !isLoading ? (
              <span className="block text-center text-xs">
                {canPrepare && !allChecked ? "Confira todos os itens para despachar." : "Escolha o motorista."}
              </span>
            ) : undefined
          }
        >
          <Button variant="cta" size="xl" disabled={!canDispatch || loading} onClick={handleDispatch}>
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Truck aria-hidden />}
            {loading ? "Despachando…" : "Despachar pedido"}
          </Button>
        </StickyActionBar>
      ) : null}
    </div>
  );
}
