"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Switch } from "@/src/components/ui/switch";
import { EmptyState } from "@/src/components/shared/empty-state";
import { FormField } from "@/src/components/shared/form-field";
import { PageHeader } from "@/src/components/shared/page-header";
import { PasswordInput } from "@/src/components/shared/password-input";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
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
  { key: "accepts_pix_online", label: "Pix", hint: "Aprovação na hora, antes de o pedido chegar a você", online: true },
  { key: "accepts_credit_online", label: "Cartão de crédito", hint: "Cobrado no app; o pedido chega já pago", online: true },
  { key: "accepts_cash_on_delivery", label: "Dinheiro", hint: "O motorista recebe na porta (com troco, se pedido)", online: false },
  { key: "accepts_card_on_delivery", label: "Cartão na maquininha", hint: "Crédito ou débito na maquininha do motorista", online: false },
];

export default function DistributorPaymentConfigPage() {
  const [distributorId, setDistributorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [savedMethods, setSavedMethods] = useState("");
  const [savedPublicKey, setSavedPublicKey] = useState("");

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
      })
      .finally(() => setResolved(true));
  }, []);

  const loadConfig = useCallback(async () => {
    if (!distributorId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/distributor/payment-settings/${distributorId}`);
      if (!res.ok) throw new Error("Erro ao carregar configuração");
      const data: DistributorPaymentSettingsView = await res.json();
      const loaded = {
        accepts_pix_online: data.accepts_pix_online,
        accepts_credit_online: data.accepts_credit_online,
        accepts_cash_on_delivery: data.accepts_cash_on_delivery,
        accepts_card_on_delivery: data.accepts_card_on_delivery,
      };
      setMethods(loaded);
      setSavedMethods(JSON.stringify(loaded));
      setSavedPublicKey(data.mp_public_key ?? "");
      setMpConnected(data.mp_connected);
      setMaskedToken(data.mp_access_token_masked);
      setPublicKey(data.mp_public_key ?? "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar");
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
      toast.success("Formas de pagamento salvas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const noneSelected = !Object.values(methods).some(Boolean);
  const dirty = JSON.stringify(methods) !== savedMethods || Boolean(accessToken.trim() || webhookSecret.trim()) || publicKey !== savedPublicKey;

  if (resolved && !distributorId) {
    return <EmptyState icon={Wallet} title="Usuário não vinculado a nenhuma distribuidora" />;
  }

  const methodRow = (item: (typeof METHOD_LABELS)[number]) => (
      <li key={item.key} className="flex min-h-16 items-center gap-3 px-4 py-3">
        <Label htmlFor={`m-${item.key}`} className="flex-1 cursor-pointer flex-col items-start gap-0.5">
          <span className="text-sm font-semibold text-foreground">{item.label}</span>
          <span className="text-xs font-normal text-muted-foreground">{item.hint}</span>
        </Label>
        <Switch id={`m-${item.key}`} checked={methods[item.key]} onCheckedChange={() => toggle(item.key)} />
      </li>
  );

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Pagamento" description="Como seus clientes podem pagar." />

      <div className="space-y-5 px-4 pb-4">
        {loading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : (
          <>
            <section aria-labelledby="sec-entrega" className="space-y-2">
              <h2 id="sec-entrega" className="text-sm font-semibold text-foreground">
                Na entrega
              </h2>
              <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
                {METHOD_LABELS.filter((m) => !m.online).map(methodRow)}
              </ul>
            </section>

            <section aria-labelledby="sec-app" className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 id="sec-app" className="text-sm font-semibold text-foreground">
                  No app · Mercado Pago
                </h2>
                <StatusBadge label={mpConnected ? "Conectado" : "Não conectado"} tone={mpConnected ? "success" : "neutral"} />
              </div>
              <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
                {METHOD_LABELS.filter((m) => m.online).map(methodRow)}
              </ul>
              {!wantsOnline && !mpConnected ? (
                <p className="text-xs text-muted-foreground">Ative Pix ou cartão no app para conectar sua conta do Mercado Pago.</p>
              ) : null}
            </section>

            {wantsOnline ? (
              <section aria-labelledby="sec-mp" className="space-y-3 rounded-2xl border border-hairline bg-card p-4">
                <h2 id="sec-mp" className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <KeyRound className="size-4 text-primary" aria-hidden /> Credenciais do Mercado Pago
                </h2>
                {mpConnected ? (
                  <p className="flex items-start gap-2 rounded-xl bg-success-surface p-3 text-xs text-success-foreground">
                    <ShieldCheck className="size-4 shrink-0" aria-hidden />
                    Conta conectada{maskedToken ? ` (token ${maskedToken})` : ""}. Deixe os campos em branco para manter.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Encontre no painel do Mercado Pago, em Suas integrações › Credenciais de produção. Guardamos criptografado e não exibimos de novo.
                  </p>
                )}
                <FormField label="Access token" error={missingGateway && !accessToken.trim() ? "Obrigatório para ativar" : null}>
                  {(field) => (
                    <PasswordInput
                      {...field}
                      autoComplete="off"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder={mpConnected ? "Manter o atual" : "APP_USR-..."}
                      className="h-11"
                    />
                  )}
                </FormField>
                <FormField label="Webhook secret" error={missingGateway && !webhookSecret.trim() ? "Obrigatório para ativar" : null}>
                  {(field) => (
                    <PasswordInput
                      {...field}
                      autoComplete="off"
                      value={webhookSecret}
                      onChange={(e) => setWebhookSecret(e.target.value)}
                      placeholder={mpConnected ? "Manter o atual" : "Assinatura secreta do webhook"}
                      className="h-11"
                    />
                  )}
                </FormField>
                <FormField label="Public key" optional>
                  {(field) => (
                    <Input {...field} autoComplete="off" value={publicKey} onChange={(e) => setPublicKey(e.target.value)} placeholder="APP_USR-..." className="h-11" />
                  )}
                </FormField>
              </section>
            ) : null}

            {noneSelected ? (
              <Alert variant="destructive">
                <AlertDescription>Ative pelo menos uma forma de pagamento, senão ninguém consegue pedir.</AlertDescription>
              </Alert>
            ) : null}
          </>
        )}
      </div>

      <StickyActionBar>
        <Button variant="cta" size="xl" disabled={!dirty || saving || loading || missingGateway || noneSelected} onClick={save}>
          {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {dirty ? "Salvar alterações" : "Tudo salvo"}
        </Button>
      </StickyActionBar>
    </div>
  );
}
