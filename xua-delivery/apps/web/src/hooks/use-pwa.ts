"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Interface for the native beforeinstallprompt event (Chrome/Android).
 * Not yet part of the standard TypeScript lib.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

/**
 * - unsupported: browser sem suporte a PWA
 * - installed:   já rodando como standalone (já instalado)
 * - ios:         iOS Safari — sem prompt automático, precisa de instrução manual
 * - available:   prompt disponível (Android/Chrome) — pode instalar
 * - dismissed:   usuário recusou o prompt
 */
export type PwaStatus = "unsupported" | "installed" | "ios" | "available" | "dismissed";

function getInitialPwaStatus(): PwaStatus {
  if (typeof window === "undefined") return "unsupported";

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (isStandalone) return "installed";

  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

  if (isIos && isSafari) return "ios";

  return "unsupported";
}

export function usePwa() {
  const [status, setStatus] = useState<PwaStatus>("unsupported");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);

  // Calcula status real apenas no cliente, após hydration
  useEffect(() => {
    setStatus(getInitialPwaStatus());
  }, []);

  useEffect(() => {
    if (status === "installed" || status === "ios") return;

    // Android / Chrome — escuta o evento nativo de instalação
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault(); // impede o mini-infobar padrão do Chrome
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setStatus("available");
    };

    // Confirmação de que instalou com sucesso
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setStatus("installed");
      setJustInstalled(true);
      setTimeout(() => setJustInstalled(false), 5000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [status]);

  /** Dispara o prompt nativo de instalação (Android/Chrome) */
  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "dismissed") {
      setStatus("dismissed");
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  return { status, justInstalled, promptInstall };
}
