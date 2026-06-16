"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CreditCard, Loader2, ShieldCheck, Wallet, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import type {
  DistributorPaymentSettingsUpdateInput,
  DistributorPaymentSettingsView,
} from "@xua/shared/schemas/distributor-payment-settings";

type Methods = {
  accepts_pix_online: boolean;
  accepts_credit_online: boolean;
  accepts_cash_on_delivery: boolean;
  accepts_card_on_delivery: boolean;
};

const METHOD_LABELS: Array<{
  key: keyof Methods;
  label: string;
  hint: string;
  online: boolean;
}> = [
  { key: "accepts_pix_online", label: "Pix (no app)", hint: "Pago no app via Mercado Pago", online: true },
  { key: "accepts_credit_online", label: "Cartão de crédito (no app)", hint: "Pago no app via Mercado Pago", online: true },
  { key: "accepts_cash_on_delivery", label: "Dinheiro na entrega", hint: "Pago ao entregador", online: false },
  { key: "accepts_card_on_delivery", label: "Cartão na entrega", hint: "Crédito/débito na maquininha do entregador", online: false },
];

export default function DistributorPaymentConfigPage() {
  const [distributorId, setDistributorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [methods, setMethods] = useState<Methods>({
    accepts_pix_online: false,
    accepts_credit_online: false,
    accepts_cash_on_delivery: true,
    accepts_card_on_delivery: false,
  });
  const [mpConnected, setMpConnected] = useState(false);
  const [maskedToken, setMaskedToken] = useState<string | null>(null);

  // Credenciais novas (write-only). Vazias = manter as já salvas.
  const [accessToken, setAccessToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [publicKey, setPublicKey] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        const id = data?.consumer?.distributor_id ?? null;
        setDistributorId(id);
        if (!id) setLoading(false);
      })
      .catch(() => {
        setDistributorId(null);
        setLoading(false);
      });
  }, []);

  const loadConfig = useCallback(async () => {
    if (!distributorId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/distributor/payment-settings/${distributorId}`);
      if (!res.ok) throw new Error("Erro ao carregar configuração");
      const data: DistributorPaymentSettingsView = await res.json();
      setMethods({
        accepts_pix_online: data.accepts_pix_online,
        accepts_credit_online: data.accepts_credit_online,
        accepts_cash_on_delivery: data.accepts_cash_on_delivery,
        accepts_card_on_delivery: data.accepts_card_on_delivery,
      });
      setMpConnected(data.mp_connected);
      setMaskedToken(data.mp_access_token_masked);
      setPublicKey(data.mp_public_key ?? "");
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Erro ao carregar" });
    } finally {
      setLoading(false);
    }
  }, [distributorId]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const wantsOnline = methods.accepts_pix_online || methods.accepts_credit_online;
  // Falta gateway se quer online, ainda não está conectado e não preencheu agora.
  const missingGateway = wantsOnline && !mpConnected && (!accessToken.trim() || !webhookSecret.trim());

  function toggle(key: keyof Methods) {
    setMethods((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function save() {
    if (!distributorId) return;
    setMessage(null);
    setSaving(true);
    try {
      const body: DistributorPaymentSettingsUpdateInput = {
        ...methods,
        ...(accessToken.trim() ? { mp_access_token: accessToken.trim() } : {}),
        ...(webhookSecret.trim() ? { mp_webhook_secret: webhookSecret.trim() } : {}),
        mp_public_key: publicKey.trim() ? publicKey.trim() : null,
      };
      const res = await fetch(`/api/distributor/payment-settings/${distributorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      // Limpa campos sensíveis e recarrega a máscara.
      setAccessToken("");
      setWebhookSecret("");
      await loadConfig();
      setMessage({ type: "success", text: "Configuração de pagamento salva" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  }

  if (!distributorId) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-sm text-[#737688]">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          "Usuário não vinculado a nenhuma distribuidora"
        )}
      </div>
    );
  }

  return (
    <div className="px-4 py-5 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Wallet className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#191c1d] font-heading">Pagamento</h1>
          <p className="text-xs text-[#737688]">
            Escolha os métodos aceitos e conecte sua conta do Mercado Pago
          </p>
        </div>
      </div>

      {message && (
        <div
          className={cn(
            "rounded-xl px-3 py-2 text-sm flex items-center gap-2",
            message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700",
          )}
        >
          {message.type === "success" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {/* Métodos aceitos */}
      <section className="rounded-2xl border border-[#e1e3e4] bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-[#191c1d]">Métodos aceitos</h2>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-[#737688]" />
          </div>
        ) : (
          METHOD_LABELS.map(({ key, label, hint, online }) => (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors",
                methods[key] ? "border-primary bg-primary/5" : "border-[#e1e3e4] bg-white",
              )}
            >
              <div>
                <p className="font-semibold text-[#191c1d] text-sm">
                  {label}
                  {online && (
                    <span className="ml-2 rounded-full bg-[#d8e2ff] px-2 py-0.5 text-[10px] font-medium text-[#32466e]">
                      Mercado Pago
                    </span>
                  )}
                </p>
                <p className="text-xs text-[#737688]">{hint}</p>
              </div>
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border",
                  methods[key] ? "border-primary bg-primary text-white" : "border-[#c4c7c8]",
                )}
              >
                {methods[key] && <Check className="h-3.5 w-3.5" />}
              </span>
            </button>
          ))
        )}
      </section>

      {/* Credenciais do gateway (só quando aceita método online) */}
      {wantsOnline && (
        <section className="rounded-2xl border border-[#e1e3e4] bg-white p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-[#191c1d]">Credenciais do Mercado Pago</h2>
          </div>

          {mpConnected ? (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
              <ShieldCheck className="h-4 w-4" />
              Gateway conectado{maskedToken ? ` (token ${maskedToken})` : ""}. Deixe os campos em
              branco para manter.
            </div>
          ) : (
            <p className="text-xs text-[#737688]">
              Para aceitar Pix ou cartão no app, informe as credenciais da sua conta do Mercado
              Pago. Elas são guardadas de forma criptografada e nunca exibidas novamente.
            </p>
          )}

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[#434656]">Access token</span>
            <input
              type="password"
              autoComplete="off"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={mpConnected ? "•••• (manter atual)" : "APP_USR-..."}
              className="w-full rounded-lg border border-[#e1e3e4] px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[#434656]">Webhook secret</span>
            <input
              type="password"
              autoComplete="off"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder={mpConnected ? "•••• (manter atual)" : "Assinatura secreta do webhook"}
              className="w-full rounded-lg border border-[#e1e3e4] px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[#434656]">Public key (opcional)</span>
            <input
              type="text"
              autoComplete="off"
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              placeholder="APP_USR-public-..."
              className="w-full rounded-lg border border-[#e1e3e4] px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>

          {missingGateway && (
            <p className="text-xs text-red-600">
              Informe access token e webhook secret para habilitar os métodos do Mercado Pago.
            </p>
          )}
        </section>
      )}

      <Button
        onClick={save}
        disabled={saving || loading || missingGateway}
        className="w-full bg-[#00E0FF] hover:bg-[#00E0FF]/90 text-[#001735]"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar configuração"}
      </Button>
    </div>
  );
}
