"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSocket } from "@/src/hooks/use-socket";
import { OrderTimeline } from "@/src/components/shared/order-timeline";
import { DeliveryWindow, OrderStatus } from "@/src/types/enums";
import { StatusPill } from "@/src/components/shared/status-pill";
import { formatCurrency, formatDate, formatTime } from "@/src/lib/utils";
import { getRenderableProductImageUrl } from "@/src/lib/product-image";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  ArrowLeft,
  Check,
  Truck,
  Home,
  Droplets,
  MapPin,
  Calendar,
  Clock,
  ShieldCheck,
  Package,
  Building2,
  CreditCard,
  UserRound,
  AlertTriangle,
} from "lucide-react";
import { getCheckoutPaymentMethodLabel, isCashPaymentMethod } from "@xua/shared/mappers/payment";
import { useOrderDetail } from "@/src/hooks/consumer/use-order-detail";
import { useSubmitRating } from "@/src/hooks/consumer/use-submit-rating";
import { ApiError } from "@/src/lib/api-client";

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  CREATED: "Criado",
  AUTHORIZED: "Autorizado",
  CAPTURED: "Pago",
  FAILED: "Falhou",
  REFUNDED: "Reembolsado",
  EXPIRED: "Expirado",
};

const PAYMENT_KIND_LABELS: Record<string, string> = {
  ORDER: "Pedido",
  SUBSCRIPTION: "Assinatura",
};

const OTP_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  USED: "Usado",
  EXPIRED: "Expirado",
  LOCKED: "Bloqueado",
};

/* -- helpers -- */
function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function formatOptional(value?: string | null) {
  return value?.trim() ? value : "Não informado";
}

function formatDateTime(date?: string | Date | null) {
  if (!date) return "Não informado";
  return `${formatDate(date)} às ${formatTime(date)}`;
}

function labelFromMap(labels: Record<string, string>, value?: string | null) {
  if (!value) return "Não informado";
  return labels[value] ?? value.replaceAll("_", " ").toLowerCase();
}

/**
 * Exibe o horário de entrega priorizando o snapshot imutável gravado no pedido.
 * Fallback para janela genérica em pedidos antigos (pré-snapshot).
 */
function formatDeliveryWindow(order: {
  scheduled_time_label?: string | null;
  scheduled_time_start_hour?: number | null;
  scheduled_time_start_minute?: number | null;
  scheduled_time_end_hour?: number | null;
  scheduled_time_end_minute?: number | null;
  delivery_window: string;
}): string {
  if (order.scheduled_time_label) return order.scheduled_time_label;
  if (
    order.scheduled_time_start_hour != null &&
    order.scheduled_time_end_hour != null
  ) {
    const sm = order.scheduled_time_start_minute ?? 0;
    const em = order.scheduled_time_end_minute ?? 0;
    return `${pad2(order.scheduled_time_start_hour)}:${pad2(sm)}–${pad2(order.scheduled_time_end_hour)}:${pad2(em)}`;
  }
  return order.delivery_window === DeliveryWindow.MORNING
    ? "Manhã (08:00–12:00)"
    : "Tarde (13:00–18:00)";
}

function getProgress(status: string) {
  const s = status as OrderStatus;
  if (s === OrderStatus.DELIVERED) return { step: 3, pct: "w-full" };
  if (
    s === OrderStatus.OUT_FOR_DELIVERY ||
    s === OrderStatus.ACCEPTED_BY_DISTRIBUTOR ||
    s === OrderStatus.SENT_TO_DISTRIBUTOR
  )
    return { step: 2, pct: "w-2/3" };
  return { step: 1, pct: "w-1/3" };
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { order, isLoading: loading, error: loadErrorRaw } = useOrderDetail(id);
  const loadError = loadErrorRaw instanceof Error ? loadErrorRaw.message : null;
  const [nps, setNps] = useState<number | null>(null);
  const [npsComment, setNpsComment] = useState("");
  const [npsSubmitted, setNpsSubmitted] = useState(false);
  const [npsMessage, setNpsMessage] = useState("");
  const [npsError, setNpsError] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState<string | null>(null);
  const { on, off } = useSocket();
  const submitRating = useSubmitRating();
  const npsSubmitting = submitRating.isPending;

  useEffect(() => {
    const handler = (...args: unknown[]) => {
      const data = args[0] as { orderId: string; code: string };
      if (data.orderId === id) setOtpCode(data.code);
    };
    on("otp_generated", handler);
    return () => off("otp_generated", handler);
  }, [id, on, off]);

  async function submitNps() {
    if (nps === null || npsSubmitting) return;
    setNpsError(null);
    try {
      await submitRating.mutateAsync({ orderId: id, rating: nps, comment: npsComment.trim() || undefined });
      setNpsMessage(
        nps <= 2
          ? "Sentimos muito! Abrimos um chamado de suporte."
          : "Obrigado pela avaliação!"
      );
      setNpsSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setNpsMessage("Você já avaliou este pedido.");
        setNpsSubmitted(true);
        return;
      }
      setNpsError(err instanceof ApiError ? err.message : "Erro de conexão. Tente novamente.");
    }
  }

  if (loading) {
    return (
      <div className="px-6 pt-6 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-2xl bg-white/80 shadow-[0_2px_12px_rgba(0,26,64,0.06)]"
          >
            <div className="p-6 space-y-3">
              <div className="h-5 w-40 rounded-lg bg-[#e1e3e4]" />
              <div className="h-3 w-56 rounded-lg bg-[#e1e3e4]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
          <Droplets className="h-10 w-10 text-red-400" />
        </div>
        <p className="text-[#737688]">{loadError ?? "Pedido não encontrado."}</p>
        <Button
          variant="ghost"
          className="mt-4 text-primary"
          onClick={() => router.push("/orders")}
        >
          Voltar aos pedidos
        </Button>
      </div>
    );
  }

  const isDelivered = order.status === "DELIVERED";
  const isPaymentExpired = order.payment_status === "expired";
  const latestPayment = order.payments[0];
  const isCashPayment = isCashPaymentMethod(latestPayment?.payment_method);
  const canResumePayment =
    (order.status === "CREATED" || order.status === "PAYMENT_PENDING") &&
    (!order.payment_status || order.payment_status.toLowerCase() === "pending") &&
    !isPaymentExpired &&
    !isCashPayment;
  const { step, pct } = getProgress(order.status);
  const latestOtp = order.otps[0];
  const hasDeliveryRecords = Boolean(
    order.qty_20l_sent != null ||
      order.qty_20l_returned != null ||
      order.collected_empty_qty > 0 ||
      order.returned_empty_qty != null ||
      order.bottle_condition ||
      order.empty_not_collected_reason ||
      order.empty_not_collected_notes ||
      order.cancellation_reason ||
      order.accepted_at ||
      order.dispatched_at ||
      order.delivered_at
  );

  return (
    <div className="pb-6">
      {/* Header */}
      <div className="px-6 pt-4 pb-2 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl bg-[#f3f4f5] flex items-center justify-center hover:bg-[#e1e3e4] transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-[#191c1d]" />
        </button>
        <div className="flex-1">
          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary">
            Detalhes do Pedido
          </p>
          <h1 className="font-heading text-xl font-extrabold tracking-tight text-[#191c1d]">
            #{shortId(order.id)}
          </h1>
        </div>
        <StatusPill status={order.status} />
      </div>

      {/* -- Active order card with progress -- */}
      <div className="mx-6 mt-4 bg-[#f3f4f5] rounded-3xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-20 -mt-20 blur-3xl" />

        <div className="relative z-10">
          {/* Product summary */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shadow-sm">
              <Droplets className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-heading text-lg font-bold text-[#191c1d]">
                {order.items.length === 1
                  ? order.items[0].product_name
                  : `${order.items.length} produtos`}
              </h3>
              <p className="text-sm text-[#737688] font-medium">
                Pedido #{shortId(order.id)} •{" "}
                <span className="text-primary">
                  {formatCurrency(order.total_cents)}
                </span>
              </p>
            </div>
          </div>

          {/* Progress tracker */}
          <div className="relative mt-6 pb-2">
            <div className="absolute top-3.5 left-0 w-full h-1 bg-[#e1e3e4] rounded-full">
              <div
                className={`h-full bg-[#00E0FF] rounded-full transition-all ${pct}`}
              />
            </div>
            <div className="relative flex justify-between">
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center ring-4 ring-[#f3f4f5]/80 ${
                    step >= 1
                      ? "bg-[#00E0FF] text-[#001735]"
                      : "bg-[#e1e3e4] text-[#737688]"
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    step >= 1 ? "text-[#001735]" : "text-[#737688]"
                  }`}
                >
                  Confirmado
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center ring-4 ring-[#f3f4f5]/80 ${
                    step >= 2
                      ? "bg-[#00E0FF] text-[#001735]"
                      : "bg-[#e1e3e4] text-[#737688]"
                  }`}
                >
                  <Truck className="h-3.5 w-3.5" />
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    step >= 2 ? "text-[#001735]" : "text-[#737688]"
                  }`}
                >
                  A caminho
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center ring-4 ring-[#f3f4f5]/80 ${
                    step >= 3
                      ? "bg-[#00E0FF] text-[#001735]"
                      : "bg-[#e1e3e4] text-[#737688]"
                  }`}
                >
                  <Home className="h-3.5 w-3.5" />
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    step >= 3 ? "text-[#001735]" : "text-[#737688]"
                  }`}
                >
                  Entregue
                </span>
              </div>
            </div>
          </div>


        </div>
      </div>

      {/* -- Payment Expired Banner -- */}
      {isPaymentExpired && (
        <div className="mx-6 mt-4 rounded-2xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100">
              <AlertTriangle className="h-4 w-4 text-red-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-red-900">Pagamento expirado</p>
              <p className="mt-0.5 text-xs text-red-700">
                {order.cancellation_reason || "Seu pedido foi cancelado automaticamente porque o prazo para pagamento expirou."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* -- Resume Payment Banner -- */}
      {canResumePayment && (
        <div className="mx-6 mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100">
              <CreditCard className="h-4 w-4 text-amber-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-amber-900">Pagamento pendente</p>
              <p className="mt-0.5 text-xs text-amber-700">
                Este pedido aguarda confirmação do pagamento. Retome para concluir.
              </p>
            </div>
          </div>
          <Button
            asChild
            className="mt-4 h-11 w-full rounded-xl bg-[#00E0FF] hover:bg-[#00E0FF]/90 text-[#001735] font-bold shadow-none transition-all active:scale-[0.98]"
          >
            <Link href={`/checkout/payment?orderId=${encodeURIComponent(order.id)}`}>
              <CreditCard className="mr-2 h-4 w-4" /> Retomar pagamento
            </Link>
          </Button>
        </div>
      )}

      {/* -- OTP Card -- */}
      {(otpCode ?? order.otp_code) && (
        <div className="mx-6 mt-4 rounded-[28px] bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_60%),linear-gradient(135deg,#1B4A9A_0%,#3670C0_50%,#5697E9_100%)] p-6 text-white shadow-[0_16px_40px_rgba(27,74,154,0.28)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/70">Confirmação de entrega</p>
              <p className="text-sm font-bold text-white">Mostre este código ao motorista</p>
            </div>
          </div>

          <div className="rounded-[20px] bg-white/15 backdrop-blur px-4 py-5 text-center">
            <p className="font-mono text-5xl font-black tracking-[0.35em] text-white drop-shadow-sm">
              {otpCode ?? order.otp_code}
            </p>
          </div>

          <p className="mt-3 text-center text-xs text-white/65">
            O motorista irá inserir este código para confirmar a entrega.
          </p>
        </div>
      )}

      {/* -- Delivery Info -- */}
      <div className="mx-6 mt-4 bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-[#737688] mb-4">
          Informações da entrega
        </h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5697E9]/15 flex items-center justify-center">
              <Package className="h-4 w-4 text-[#5697E9]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#191c1d]">
                {formatDate(order.created_at)} às {formatTime(order.created_at)}
              </p>
              <p className="text-xs text-[#737688]">Pedido realizado</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5697E9]/15 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-[#5697E9]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#191c1d]">
                {formatDate(order.delivery_date)}
              </p>
              <p className="text-xs text-[#737688]">Data da entrega</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5697E9]/15 flex items-center justify-center">
              <Clock className="h-4 w-4 text-[#5697E9]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#191c1d]">
                {formatDeliveryWindow(order)}
              </p>
              <p className="text-xs text-[#737688]">Janela de entrega</p>
            </div>
          </div>
        </div>
      </div>

      {/* -- Delivery Address -- */}
      {(order.address_line ?? order.address_details) && (
        <div className="mx-6 mt-4 bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-[#737688] mb-4">
            Endereço de entrega
          </h3>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5697E9]/15 flex items-center justify-center shrink-0 mt-0.5">
              <MapPin className="h-4 w-4 text-[#5697E9]" />
            </div>
            <div className="space-y-0.5">
              {order.address_details ? (
                <>
                  <p className="text-sm font-semibold text-[#191c1d]">
                    {order.address_details.street}, {order.address_details.number}
                    {order.address_details.complement ? ` — ${order.address_details.complement}` : ""}
                  </p>
                  <p className="text-xs text-[#737688]">
                    {order.address_details.neighborhood} · {order.address_details.city}/{order.address_details.state}
                  </p>
                  <p className="text-xs text-[#737688]">CEP: {order.address_details.zip_code}</p>
                </>
              ) : (
                <p className="text-sm font-semibold text-[#191c1d]">{order.address_line}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -- Operation -- */}
      <div className="mx-6 mt-4 bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-[#737688] mb-4">
          Operação do pedido
        </h3>
        <div className="space-y-4 text-sm">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5697E9]/15 flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4 text-[#5697E9]" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[#191c1d]">{order.distributor_name}</p>
              <p className="text-xs text-[#737688]">
                {order.zone_name} • {formatOptional(order.distributor_phone)}
              </p>
              {order.distributor_email && (
                <p className="text-xs text-[#737688] break-all">{order.distributor_email}</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5697E9]/15 flex items-center justify-center shrink-0">
              <UserRound className="h-4 w-4 text-[#5697E9]" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[#191c1d]">
                {order.driver_name ?? "Motorista ainda não atribuído"}
              </p>
              <p className="text-xs text-[#737688]">
                {order.driver_name ? formatOptional(order.driver_phone) : "Será exibido quando o pedido for despachado"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* -- Payment and bottles -- */}
      <div className="mx-6 mt-4 bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-[#737688] mb-4">
          Pagamento e vasilhames
        </h3>
        <div className="space-y-4 text-sm">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5697E9]/15 flex items-center justify-center shrink-0">
              <CreditCard className="h-4 w-4 text-[#5697E9]" />
            </div>
            <div className="min-w-0 flex-1">
              {latestPayment ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[#191c1d]">
                      {labelFromMap(PAYMENT_KIND_LABELS, latestPayment.kind)} • {labelFromMap(PAYMENT_STATUS_LABELS, latestPayment.status)}
                    </p>
                    <span className="font-bold text-primary">{formatCurrency(latestPayment.amount_cents)}</span>
                  </div>
                  <p className="text-xs text-[#737688]">
                    {getCheckoutPaymentMethodLabel(latestPayment.payment_method)} • {latestPayment.paid_at ? `Pago em ${formatDateTime(latestPayment.paid_at)}` : `Criado em ${formatDateTime(latestPayment.created_at)}`}
                  </p>
                  {isCashPayment && (
                    <p className="mt-1 text-xs font-semibold text-[#805300]">
                      {latestPayment.cash_change_for_cents == null
                        ? "Dinheiro em valor exato."
                        : `Troco para ${formatCurrency(latestPayment.cash_change_for_cents)}.`}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-semibold text-[#191c1d]">
                    {order.payment_status ? labelFromMap(PAYMENT_STATUS_LABELS, order.payment_status) : "Pagamento não registrado"}
                  </p>
                  <p className="text-xs text-[#737688]">Nenhum pagamento vinculado a este pedido no banco.</p>
                </>
              )}
            </div>
          </div>

          {/* Bloco de vasilhames: só para pedidos legados do fluxo de caução (sempre 0 na venda simples) */}
          {(order.bottles_loaned > 0 ||
            order.bottles_sold > 0 ||
            order.empty_bottles_provided > 0) && (
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#5697E9]/15 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-4 w-4 text-[#5697E9]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[#191c1d]">
                  {order.bottles_loaned > 0
                    ? `${order.bottles_loaned} em caução`
                    : order.bottles_sold > 0
                    ? `${order.bottles_sold} adquirido(s)`
                    : "Sem vasilhames adicionais"}
                </p>
                <p className="text-xs text-[#737688]">
                  {order.empty_bottles_provided > 0
                    ? `${order.empty_bottles_provided} vasilhame(s) informado(s) para troca`
                    : "Nenhum vasilhame informado para troca"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* -- OTP status -- */}
      {latestOtp && (
        <div className="mx-6 mt-4 bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-[#737688] mb-4">
            Código de confirmação
          </h3>
          <div className="flex items-start gap-3 text-sm">
            <div className="w-9 h-9 rounded-xl bg-[#5697E9]/15 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-4 w-4 text-[#5697E9]" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[#191c1d]">{labelFromMap(OTP_STATUS_LABELS, latestOtp.status)}</p>
              <p className="text-xs text-[#737688]">
                {latestOtp.attempts} tentativa{latestOtp.attempts === 1 ? "" : "s"} • Expira em {formatDateTime(latestOtp.expires_at)}
              </p>
              {!order.otp_code && !otpCode && latestOtp.status === "ACTIVE" && (
                <p className="mt-1 text-xs text-[#737688]">
                  O código em claro é enviado em tempo real e não é salvo no banco por segurança.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -- Delivery records -- */}
      {hasDeliveryRecords && (
        <div className="mx-6 mt-4 bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-[#737688] mb-4">
            Registros da entrega
          </h3>
          <div className="space-y-2 text-sm text-[#737688]">
            {order.accepted_at && <p>Aceito em {formatDateTime(order.accepted_at)}</p>}
            {order.dispatched_at && <p>Despachado em {formatDateTime(order.dispatched_at)}</p>}
            {order.delivered_at && <p>Entregue em {formatDateTime(order.delivered_at)}</p>}
            {order.qty_20l_sent != null && <p>Galões enviados: {order.qty_20l_sent}</p>}
            {order.qty_20l_returned != null && <p>Galões retornados: {order.qty_20l_returned}</p>}
            {order.collected_empty_qty > 0 && <p>Vasilhames coletados: {order.collected_empty_qty}</p>}
            {order.returned_empty_qty != null && <p>Vasilhames devolvidos: {order.returned_empty_qty}</p>}
            {order.bottle_condition && <p>Condição dos vasilhames: {order.bottle_condition}</p>}
            {order.empty_not_collected_reason && <p>Motivo de não coleta: {order.empty_not_collected_reason}</p>}
            {order.empty_not_collected_notes && <p>Observações: {order.empty_not_collected_notes}</p>}
            {order.cancellation_reason && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Motivo do cancelamento: {order.cancellation_reason}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* -- Items -- */}
      <div className="mx-6 mt-4 bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-[#737688] mb-4">
          Itens do Pedido
        </h3>
        <div className="space-y-3 text-sm">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#f3f4f5] flex items-center justify-center overflow-hidden shrink-0">
                  {getRenderableProductImageUrl(item.image_url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={getRenderableProductImageUrl(item.image_url)!}
                      alt={item.product_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Droplets className="h-4 w-4 text-primary" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-[#191c1d]">{item.product_name}</p>
                  <p className="text-xs text-[#737688]">Qtd: {item.qty}</p>
                </div>
              </div>
              <span className="font-heading font-bold text-[#191c1d]">
                {formatCurrency(item.subtotal_cents)}
              </span>
            </div>
          ))}

          <div className="pt-3 mt-3 border-t border-[#e1e3e4] space-y-1.5">
            <div className="flex justify-between text-[#737688]">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal_cents)}</span>
            </div>
            {order.bottles_sold > 0 && order.total_cents > order.subtotal_cents && (
              <div className="flex justify-between text-[#737688]">
                <span>Vasilhames ({order.bottles_sold})</span>
                <span>{formatCurrency(order.total_cents - order.subtotal_cents)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-[#191c1d] pt-1.5 border-t border-[#e1e3e4]">
              <span>Total</span>
              <span className="text-primary">
                {formatCurrency(order.total_cents)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* -- Timeline -- */}
      {order.events.length > 0 && (
        <div className="mx-6 mt-4 bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-[#737688] mb-4">
            Timeline
          </h3>
          <OrderTimeline events={order.events} />
        </div>
      )}

      {/* -- NPS já avaliado -- */}
      {isDelivered && order.nps_score != null && (
        <div className="mx-6 mt-4 bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-[#737688] mb-3">
            Sua avaliação
          </h3>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: 5 }, (_, i) => i + 1).map((score) => (
              <div
                key={score}
                className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold ${
                  score <= order.nps_score!
                    ? "bg-primary text-white"
                    : "bg-[#f3f4f5] text-[#b0b3c6]"
                }`}
              >
                {score}
              </div>
            ))}
          </div>
          {order.nps_comment && (
            <p className="mt-3 text-sm text-[#737688] italic">{order.nps_comment}</p>
          )}
        </div>
      )}

      {/* -- NPS Rating (ainda não avaliado) -- */}
      {isDelivered && order.nps_score == null && !npsSubmitted && (
        <div className="mx-6 mt-4 bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-[#737688] mb-4">
            Avalie sua entrega
          </h3>
          <div className="space-y-3">
            <div className="flex justify-center gap-1.5">
              {Array.from({ length: 5 }, (_, i) => i + 1).map((score) => (
                <button
                  key={score}
                  onClick={() => !npsSubmitting && setNps(score)}
                  disabled={npsSubmitting}
                  className={`h-11 w-11 rounded-full text-sm font-bold transition-all active:scale-95 ${
                    nps === score
                      ? "bg-linear-to-br from-primary to-primary-hover text-white shadow-[0_2px_8px_rgba(27,74,154,0.3)]"
                      : "bg-[#f3f4f5] text-[#737688] hover:bg-[#e1e3e4]"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {score}
                </button>
              ))}
            </div>
            <Input
              placeholder="Comentário (opcional)"
              value={npsComment}
              onChange={(e) => setNpsComment(e.target.value)}
              disabled={npsSubmitting}
              className="rounded-xl border-0 bg-[#f3f4f5]"
            />
            <Button
              className="w-full rounded-xl bg-primary hover:bg-primary-hover font-bold shadow-lg hover:opacity-90 active:scale-[0.98]"
              onClick={submitNps}
              disabled={nps === null || npsSubmitting}
            >
              {npsSubmitting ? "Enviando..." : "Enviar avaliação"}
            </Button>
            {npsError && (
              <p className="text-center text-sm font-medium text-red-500">{npsError}</p>
            )}
          </div>
        </div>
      )}

      {npsSubmitted && (
        <p
          className={`mx-6 mt-4 text-center text-sm font-medium ${
            nps !== null && nps <= 2 ? "text-red-500" : "text-green-600"
          }`}
        >
          {npsMessage}
        </p>
      )}
    </div>
  );
}
