"use client";

import { useState } from "react";
import { Bell, BellOff, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Switch } from "@/src/components/ui/switch";
import { cn } from "@/src/lib/utils";
import { usePushSubscription, type PushState } from "@/src/hooks/use-push-subscription";

const HINT: Partial<Record<PushState, string>> = {
  denied: "Bloqueadas no navegador. Libere nas configurações do site para ativar.",
  "ios-install": "No iPhone, adicione o Xuá à tela de início (Compartilhar → Adicionar à Tela de Início) e ative por lá.",
  unsupported: "Este navegador não recebe notificações.",
  unavailable: "Indisponível neste ambiente.",
};

/**
 * Cartão "Notificações" (perfil/conta) com interruptor (T5.7). Mostra o motivo
 * quando não dá para ativar (bloqueado, iPhone sem instalar, sem suporte).
 */
export function PushNotificationsCard({ description }: { description: string }) {
  const { state, busy, error, subscribe, unsubscribe } = usePushSubscription();
  if (state === "loading") return null;

  const subscribed = state === "subscribed";
  const canToggle = state === "default" || state === "subscribed";
  const hint = HINT[state];

  return (
    <div className="rounded-2xl border border-hairline bg-card px-4 py-3">
      <div className="flex min-h-10 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky/10 text-primary">
          {subscribed ? <Bell className="size-5" aria-hidden /> : <BellOff className="size-5" aria-hidden />}
        </span>
        <label htmlFor="push-toggle" className="min-w-0 flex-1 cursor-pointer">
          <span className="block text-sm font-semibold text-foreground">Notificações neste aparelho</span>
          <span className="block text-xs text-muted-foreground">{hint ?? description}</span>
        </label>
        {canToggle ? (
          <Switch
            id="push-toggle"
            checked={subscribed}
            disabled={busy}
            onCheckedChange={(checked) => void (checked ? subscribe() : unsubscribe())}
          />
        ) : null}
      </div>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * Convite contextual para ativar (fila da distribuidora, confirmação do pedido).
 * Só aparece quando dá para ativar e a pessoa ainda não ativou nem dispensou.
 * Nunca pede permissão sozinho: só no clique.
 */
export function PushOptInBanner({
  storageKey,
  title,
  description,
  className,
}: {
  storageKey: string;
  title: string;
  description: string;
  className?: string;
}) {
  const { state, busy, error, subscribe } = usePushSubscription();
  const [dismissed, setDismissed] = useState(() => typeof window !== "undefined" && readDismissed(storageKey));

  if (dismissed || state !== "default") return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Sem storage: some só nesta página.
    }
    setDismissed(true);
  };

  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Bell className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
        <Button size="sm" className="mt-2" disabled={busy} onClick={() => void subscribe()}>
          Ativar notificações
        </Button>
      </div>
      <Button variant="ghost" size="icon" aria-label="Agora não" onClick={dismiss}>
        <X />
      </Button>
    </div>
  );
}
