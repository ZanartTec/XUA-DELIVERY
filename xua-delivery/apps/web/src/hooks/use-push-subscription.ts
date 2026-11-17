"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/src/lib/api-client";
import { isIosWithoutInstall, urlBase64ToUint8Array } from "@/src/lib/vapid";

/**
 * - `unsupported`: navegador sem Web Push.
 * - `ios-install`: iPhone fora do app instalado (precisa instalar na tela inicial).
 * - `unavailable`: sem service worker registrado (ex.: modo dev) ou sem chave VAPID.
 * - `denied`: a pessoa bloqueou notificações no navegador.
 * - `default`: ainda não ativou.
 * - `subscribed`: este navegador recebe notificações desta conta.
 */
export type PushState = "loading" | "unsupported" | "ios-install" | "unavailable" | "denied" | "default" | "subscribed";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

async function resolveState(): Promise<PushState> {
  if (typeof window === "undefined") return "loading";
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (isIosWithoutInstall(navigator.userAgent, standalone)) return "ios-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const registration = await getRegistration();
  if (!registration || !VAPID_PUBLIC_KEY) return "unavailable";
  const subscription = await registration.pushManager.getSubscription();
  return subscription && Notification.permission === "granted" ? "subscribed" : "default";
}

/** Web Push deste navegador para o usuário logado (T5.6). */
export function usePushSubscription() {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => setState(await resolveState()), []);

  useEffect(() => {
    let active = true;
    void resolveState().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const subscribe = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "default");
        return false;
      }
      const registration = await getRegistration();
      if (!registration || !VAPID_PUBLIC_KEY) {
        setState("unavailable");
        return false;
      }
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));
      const json = subscription.toJSON();
      // Mesmo com inscrição antiga no navegador, reenvia: o servidor faz upsert
      // por endpoint e passa o token para quem está logado agora.
      await api.post("/api/notifications/subscribe", { endpoint: json.endpoint, keys: json.keys });
      setState("subscribed");
      return true;
    } catch {
      setError("Não foi possível ativar as notificações. Tente de novo.");
      await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const unsubscribe = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await removePushSubscription();
      setState("default");
    } catch {
      setError("Não foi possível desativar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, error, subscribe, unsubscribe };
}

/**
 * Remove a inscrição deste navegador: primeiro no servidor (só apaga se for
 * do usuário logado), depois no navegador. Usado no "desativar" e no logout
 * (T5.8), para que um aparelho compartilhado não receba push do anterior.
 */
export async function removePushSubscription(): Promise<void> {
  if (!pushSupported()) return;
  const registration = await getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await api.delete("/api/notifications/subscribe", { endpoint: subscription.endpoint });
  } finally {
    await subscription.unsubscribe().catch(() => false);
  }
}
