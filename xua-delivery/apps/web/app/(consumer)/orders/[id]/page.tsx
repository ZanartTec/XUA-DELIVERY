"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CreditCard,
  Droplets,
  MapPin,
  MessageCircle,
  Phone,
  Recycle,
  ShieldCheck,
  Star,
  UserRound,
} from "lucide-react";
import { useSocket } from "@/src/hooks/use-socket";
import { useOrderDetail } from "@/src/hooks/consumer/use-order-detail";
import { useSubmitRating } from "@/src/hooks/consumer/use-submit-rating";
import { OrderTimeline } from "@/src/components/shared/order-timeline";
import { PageHeader } from "@/src/components/shared/page-header";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { OrderStepper } from "@/src/components/shared/order-stepper";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { ConfirmAction } from "@/src/components/shared/confirm-action";
import { EmptyState } from "@/src/components/shared/empty-state";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/src/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Separator } from "@/src/components/ui/separator";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { ApiError, api } from "@/src/lib/api-client";
import { formatCurrency, formatDate, formatTime, cn } from "@/src/lib/utils";
import { plural, phoneHref, whatsappHref, formatPhone } from "@/src/lib/format";
import { formatScheduledTime, formatShortOrderId } from "@/src/lib/order-detail-format";
import { consumerOrderProgress } from "@/src/lib/order-status";
import { getRenderableProductImageUrl as getProductImage } from "@/src/lib/product-image";
import { getCheckoutPaymentMethodLabel, isCashPaymentMethod, isOfflinePaymentMethod } from "@xua/shared/mappers/payment";
import { OrderStatus } from "@/src/types/enums";

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  CREATED: "Aguardando",
  AUTHORIZED: "Autorizado",
  CAPTURED: "Pago",
  FAILED: "Não aprovado",
  REFUNDED: "Reembolsado",
  EXPIRED: "Expirado",
};

const OTP_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  USED: "Usado",
  EXPIRED: "Expirado",
  LOCKED: "Bloqueado",
};

/** Antes do aceite da distribuidora o próprio cliente pode cancelar. */
const CONSUMER_CANCELLABLE: readonly string[] = [
  OrderStatus.CREATED,
  OrderStatus.PAYMENT_PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.SENT_TO_DISTRIBUTOR,
];

function formatDateTime(date?: string | Date | null) {
  if (!date) return "—";
  return `${formatDate(date)} às ${formatTime(date)}`;
}

function InfoRow({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { order, isLoading, error: loadErrorRaw, refetch } = useOrderDetail(id);
  const loadError = loadErrorRaw instanceof Error ? loadErrorRaw.message : null;
  const [otpCode, setOtpCode] = useState<string | null>(null);
  const { on, off } = useSocket();

  const [nps, setNps] = useState<number | null>(null);
  const [npsComment, setNpsComment] = useState("");
  const [npsMessage, setNpsMessage] = useState<string | null>(null);
  const [npsError, setNpsError] = useState<string | null>(null);
  const submitRating = useSubmitRating();

  useEffect(() => {
    const handler = (...args: unknown[]) => {
      const data = args[0] as { orderId: string; code: string };
      if (data.orderId === id) setOtpCode(data.code);
    };
    on("otp_generated", handler);
    return () => off("otp_generated", handler);
  }, [id, on, off]);

  async function submitNps() {
    if (nps === null || submitRating.isPending) return;
    setNpsError(null);
    try {
      await submitRating.mutateAsync({ orderId: id, rating: nps, comment: npsComment.trim() || undefined });
      setNpsMessage(nps <= 2 ? "Sentimos muito! Abrimos um chamado de suporte para você." : "Obrigado pela avaliação!");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setNpsMessage("Você já avaliou este pedido.");
        return;
      }
      setNpsError(err instanceof ApiError ? err.message : "Erro de conexão. Tente novamente.");
    }
  }

  async function cancelOrder() {
    try {
      await api.patch(`/api/orders/${encodeURIComponent(id)}/cancel`, { reason: "Cancelado pelo cliente" });
      toast.success("Pedido cancelado");
      await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ["orders"] })]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível cancelar o pedido.");
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-3 px-4 pt-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader back="/orders" title="Pedido" />
        <EmptyState
          icon={Droplets}
          title={loadError ?? "Pedido não encontrado"}
          action={
            <Button asChild variant="outline">
              <Link href="/orders">Voltar aos pedidos</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const progress = consumerOrderProgress(order.status);
  const isDelivered = order.status === OrderStatus.DELIVERED;
  const isPaymentExpired = order.payment_status === "expired";
  const latestPayment = order.payments[0];
  const isCashPayment = isCashPaymentMethod(latestPayment?.payment_method);
  const paidOnline = latestPayment?.status === "CAPTURED" && !isOfflinePaymentMethod(latestPayment?.payment_method);
  const canResumePayment =
    (order.status === OrderStatus.CREATED || order.status === OrderStatus.PAYMENT_PENDING) &&
    (!order.payment_status || order.payment_status.toLowerCase() === "pending") &&
    !isPaymentExpired &&
    !isOfflinePaymentMethod(latestPayment?.payment_method);
  const canCancel = CONSUMER_CANCELLABLE.includes(order.status) && !paidOnline;
  const otp = otpCode ?? order.otp_code;
  const latestOtp = order.otps[0];
  const callHref = phoneHref(order.distributor_phone);
  const chatHref = whatsappHref(order.distributor_phone);
  const showRating = isDelivered && order.nps_score == null && !npsMessage;

  const hasDeliveryRecords = Boolean(
    order.accepted_at ||
      order.dispatched_at ||
      order.delivered_at ||
      order.collected_empty_qty > 0 ||
      order.returned_empty_qty != null ||
      order.bottle_condition ||
      order.empty_not_collected_reason ||
      order.empty_not_collected_notes,
  );

  const hasBar = canResumePayment || canCancel || Boolean(callHref);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        back="/orders"
        eyebrow="Pedido"
        title={`#${formatShortOrderId(order.id)}`}
        description={`Feito em ${formatDateTime(order.created_at)}`}
      />

      <div className="space-y-4 px-4 pt-1 pb-4">
        {/* Topo: o que importa agora — código de entrega, andamento e previsão */}
        {otp ? (
          <Card className="flex flex-col gap-3 rounded-2xl border-0 bg-linear-to-br from-primary to-sky p-5 text-primary-foreground shadow-lg">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5" aria-hidden />
              <p className="text-sm font-semibold">Mostre este código ao entregador</p>
            </div>
            <p className="text-center font-mono text-5xl font-black tracking-[0.3em]" aria-label={`Código ${otp.split("").join(" ")}`}>
              {otp}
            </p>
            <p className="text-center text-xs text-primary-foreground/75">Ele digita o código para confirmar a entrega.</p>
          </Card>
        ) : null}

        <Card className="flex flex-col gap-4 rounded-2xl border-hairline p-4">
          <StatusBadge status={order.status} className="self-start" />
          {progress.kind === "issue" ? (
            <Alert variant="destructive" className="border-0 bg-danger-surface">
              <AlertTriangle aria-hidden />
              <AlertTitle>
                {order.status === OrderStatus.CANCELLED
                  ? "Pedido cancelado"
                  : order.status === OrderStatus.REJECTED_BY_DISTRIBUTOR
                    ? "A distribuidora recusou o pedido"
                    : "Não foi possível entregar"}
              </AlertTitle>
              {order.cancellation_reason ? <AlertDescription>{order.cancellation_reason}</AlertDescription> : null}
            </Alert>
          ) : (
            <OrderStepper status={order.status} />
          )}
          {progress.kind !== "issue" ? (
          <InfoRow icon={CalendarClock}>
            <p className="font-medium text-foreground">
              {isDelivered && order.delivered_at ? `Entregue em ${formatDateTime(order.delivered_at)}` : `${formatDate(order.delivery_date)} · ${formatScheduledTime(order)}`}
            </p>
            {!isDelivered ? <p className="text-xs text-muted-foreground">Entrega prevista</p> : null}
          </InfoRow>
          ) : null}
        </Card>

        {isPaymentExpired ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden />
            <AlertTitle>Pagamento expirado</AlertTitle>
            <AlertDescription>
              {order.cancellation_reason || "O pedido foi cancelado porque o prazo para pagamento acabou."}
            </AlertDescription>
          </Alert>
        ) : null}

        {canResumePayment ? (
          <Alert className="border-warning/30 bg-warning-surface">
            <CreditCard aria-hidden className="text-warning-foreground" />
            <AlertTitle className="text-warning-foreground">Pagamento pendente</AlertTitle>
            <AlertDescription className="text-warning-foreground">
              O pedido só vai para a distribuidora depois que o pagamento for confirmado.
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Vasilhame: antes da entrega o que separar; depois, o que foi trocado/cobrado */}
        {order.max_bottle_charge_cents > 0 && (progress.kind !== "issue" || order.bottle_step_recorded_at != null) ? (
          <Card className="flex flex-col flex-row items-start gap-3 rounded-2xl border-0 bg-sky/10 p-4 text-sm">
            <Recycle className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            {order.bottle_step_recorded_at == null ? (
              <div>
                <p className="font-semibold text-foreground">
                  Separe {plural(order.bottles_full_ordered, "vasilhame vazio", "vasilhames vazios")} para a troca
                </p>
                <p className="text-xs text-muted-foreground">
                  Sem eles, o entregador cobra o vasilhame na entrega (até {formatCurrency(order.max_bottle_charge_cents)}) ou
                  entrega só o que tiver troca.
                </p>
              </div>
            ) : (
              <div>
                <p className="font-semibold text-foreground">
                  {plural(order.empty_bottles_provided, "vasilhame trocado", "vasilhames trocados")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {order.bottles_sold > 0
                    ? `${plural(order.bottles_sold, "vasilhame cobrado", "vasilhames cobrados")} na entrega (${formatCurrency(order.bottle_charge_cents)})`
                    : order.bottles_loaned > 0
                      ? `${order.bottles_loaned} em caução`
                      : "Sem cobrança de vasilhame"}
                </p>
              </div>
            )}
          </Card>
        ) : null}

        {/* Avaliação pós-entrega */}
        {showRating ? (
          <Card className="flex flex-col gap-3 rounded-2xl border-hairline p-4">
            <p className="font-heading font-semibold text-foreground">Como foi a entrega?</p>
            <div role="radiogroup" aria-label="Nota de 1 a 5" className="flex justify-between gap-2">
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  key={score}
                  type="button"
                  role="radio"
                  aria-checked={nps === score}
                  aria-label={`${score} de 5`}
                  disabled={submitRating.isPending}
                  onClick={() => setNps(score)}
                  className="flex size-12 items-center justify-center rounded-full transition-colors hover:bg-muted"
                >
                  <Star className={cn("size-7", nps !== null && score <= nps ? "fill-warning text-warning" : "text-muted-foreground")} aria-hidden />
                </button>
              ))}
            </div>
            {nps !== null ? (
              <>
                <Textarea
                  placeholder="Conte mais (opcional)"
                  value={npsComment}
                  onChange={(e) => setNpsComment(e.target.value)}
                  rows={2}
                  className="resize-none text-base md:text-sm"
                />
                <Button variant="default" size="xl" onClick={submitNps} disabled={submitRating.isPending}>
                  {submitRating.isPending ? "Enviando…" : "Enviar avaliação"}
                </Button>
              </>
            ) : null}
            {npsError ? <p className="text-sm font-medium text-destructive">{npsError}</p> : null}
          </Card>
        ) : null}
        {npsMessage ? <p className="text-center text-sm font-medium text-success-foreground">{npsMessage}</p> : null}
        {isDelivered && order.nps_score != null ? (
          <Card className="flex flex-col flex-row items-center gap-2 rounded-2xl border-hairline p-4 text-sm">
            <span className="text-muted-foreground">Sua avaliação</span>
            <span className="flex">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} className={cn("size-4", s <= order.nps_score! ? "fill-warning text-warning" : "text-muted-foreground")} aria-hidden />
              ))}
            </span>
            {order.nps_comment ? <span className="truncate text-muted-foreground italic">“{order.nps_comment}”</span> : null}
          </Card>
        ) : null}

        {/* Meio: detalhes em seções recolhíveis */}
        <Accordion type="multiple" defaultValue={["itens"]} className="overflow-hidden rounded-2xl border border-hairline bg-card px-4">
          <AccordionItem value="itens">
            <AccordionTrigger>
              Itens · {formatCurrency(order.total_cents)}
            </AccordionTrigger>
            <AccordionContent className="space-y-3">
              {order.items.map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary/60">
                    {getProductImage(item.image_url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={getProductImage(item.image_url)!} alt="" className="size-full object-cover" />
                    ) : (
                      <Droplets className="size-4 text-primary" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {plural(item.qty, "unidade", "unidades")}
                      {item.original_qty != null && item.original_qty !== item.qty
                        ? ` (pedido: ${item.original_qty}; sem vasilhame para troca)`
                        : ""}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatCurrency(item.subtotal_cents)}</span>
                </div>
              ))}
              <Separator />
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(order.subtotal_cents)}</span>
                </div>
                {order.bottles_sold > 0 && order.total_cents > order.subtotal_cents ? (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Vasilhames ({order.bottles_sold})</span>
                    <span className="tabular-nums">{formatCurrency(order.total_cents - order.subtotal_cents)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between font-semibold text-foreground">
                  <span>Total</span>
                  <span className="text-primary tabular-nums">{formatCurrency(order.total_cents)}</span>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="entrega">
            <AccordionTrigger>Entrega</AccordionTrigger>
            <AccordionContent className="space-y-4">
              {order.address_details ? (
                <InfoRow icon={MapPin}>
                  <p className="font-medium text-foreground">
                    {order.address_details.street}, {order.address_details.number}
                    {order.address_details.complement ? ` — ${order.address_details.complement}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {order.address_details.neighborhood} · {order.address_details.city}/{order.address_details.state} · CEP{" "}
                    {order.address_details.zip_code}
                  </p>
                </InfoRow>
              ) : order.address_line ? (
                <InfoRow icon={MapPin}>
                  <p className="font-medium text-foreground">{order.address_line}</p>
                </InfoRow>
              ) : null}
              <InfoRow icon={Building2}>
                <p className="font-medium text-foreground">{order.distributor_name}</p>
                <p className="text-xs text-muted-foreground">
                  {order.distributor_phone ? formatPhone(order.distributor_phone) : "Telefone não informado"}
                </p>
                {chatHref ? (
                  <a href={chatHref} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    <MessageCircle className="size-3.5" aria-hidden /> Conversar no WhatsApp
                  </a>
                ) : null}
              </InfoRow>
              <InfoRow icon={UserRound}>
                <p className="font-medium text-foreground">{order.driver_name ?? "Entregador ainda não definido"}</p>
                <p className="text-xs text-muted-foreground">
                  {order.driver_name
                    ? order.driver_phone
                      ? formatPhone(order.driver_phone)
                      : "Telefone não informado"
                    : "Aparece quando o pedido sair para entrega"}
                </p>
              </InfoRow>
              {hasDeliveryRecords ? (
                <div className="space-y-1 rounded-xl bg-surface-low p-3 text-xs text-muted-foreground">
                  {order.accepted_at ? <p>Aceito em {formatDateTime(order.accepted_at)}</p> : null}
                  {order.dispatched_at ? <p>Saiu para entrega em {formatDateTime(order.dispatched_at)}</p> : null}
                  {order.delivered_at ? <p>Entregue em {formatDateTime(order.delivered_at)}</p> : null}
                  {order.collected_empty_qty > 0 ? <p>Vasilhames coletados: {order.collected_empty_qty}</p> : null}
                  {order.returned_empty_qty != null ? <p>Vasilhames devolvidos: {order.returned_empty_qty}</p> : null}
                  {order.bottle_condition ? <p>Condição dos vasilhames: {order.bottle_condition}</p> : null}
                  {order.empty_not_collected_reason ? <p>Vazio não coletado: {order.empty_not_collected_reason}</p> : null}
                  {order.empty_not_collected_notes ? <p>Observações: {order.empty_not_collected_notes}</p> : null}
                </div>
              ) : null}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="pagamento">
            <AccordionTrigger>Pagamento</AccordionTrigger>
            <AccordionContent className="space-y-3">
              {latestPayment ? (
                <InfoRow icon={CreditCard}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-foreground">{getCheckoutPaymentMethodLabel(latestPayment.payment_method)}</p>
                    <StatusBadge
                      label={PAYMENT_STATUS_LABELS[latestPayment.status] ?? latestPayment.status}
                      tone={latestPayment.status === "CAPTURED" ? "success" : latestPayment.status === "FAILED" || latestPayment.status === "EXPIRED" ? "danger" : "warning"}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(latestPayment.amount_cents)} ·{" "}
                    {latestPayment.paid_at
                      ? `pago em ${formatDateTime(latestPayment.paid_at)}`
                      : isOfflinePaymentMethod(latestPayment.payment_method)
                        ? "pago ao entregador"
                        : `criado em ${formatDateTime(latestPayment.created_at)}`}
                  </p>
                  {isCashPayment ? (
                    <p className="mt-1 text-xs font-medium text-warning-foreground">
                      {latestPayment.cash_change_for_cents == null
                        ? "Dinheiro em valor exato."
                        : `Troco para ${formatCurrency(latestPayment.cash_change_for_cents)}.`}
                    </p>
                  ) : null}
                </InfoRow>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
              )}
              {latestOtp ? (
                <InfoRow icon={ShieldCheck}>
                  <p className="font-medium text-foreground">Código de entrega: {OTP_STATUS_LABELS[latestOtp.status] ?? latestOtp.status}</p>
                  <p className="text-xs text-muted-foreground">
                    {plural(latestOtp.attempts, "tentativa", "tentativas")} · expira em {formatDateTime(latestOtp.expires_at)}
                  </p>
                </InfoRow>
              ) : null}
            </AccordionContent>
          </AccordionItem>

          {order.events.length > 0 ? (
            <AccordionItem value="historico" className="border-b-0">
              <AccordionTrigger>Histórico</AccordionTrigger>
              <AccordionContent>
                <OrderTimeline events={order.events} />
              </AccordionContent>
            </AccordionItem>
          ) : null}
        </Accordion>
      </div>

      {/* Base: ação contextual */}
      {hasBar ? (
        <StickyActionBar>
          {canResumePayment ? (
            <Button asChild variant="cta" size="xl">
              <Link href={`/checkout/payment?orderId=${encodeURIComponent(order.id)}`}>
                <CreditCard /> Retomar pagamento
              </Link>
            </Button>
          ) : null}
          {canCancel ? (
            <ConfirmAction
              trigger={
                <Button variant="destructive-soft" size="xl">
                  Cancelar pedido
                </Button>
              }
              title="Cancelar este pedido?"
              description="A distribuidora será avisada e o pedido não será entregue. Essa ação não pode ser desfeita."
              confirmLabel="Cancelar pedido"
              cancelLabel="Manter pedido"
              destructive
              onConfirm={cancelOrder}
            />
          ) : null}
          {!canResumePayment && callHref ? (
            <Button asChild variant={canCancel ? "outline" : "default"} size="xl">
              <a href={callHref}>
                <Phone /> {canCancel ? "Ligar" : "Ligar para a distribuidora"}
              </a>
            </Button>
          ) : null}
        </StickyActionBar>
      ) : null}
    </div>
  );
}
