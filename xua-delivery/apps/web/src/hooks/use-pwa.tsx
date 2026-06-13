"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

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
 * - dismissed:   usuário recusou o prompt nativo
 */
export type PwaStatus = "unsupported" | "installed" | "ios" | "available" | "dismissed";

/** Chave de persistência da preferência "não mostrar o card automático". */
const DISMISS_STORAGE_KEY = "xua:pwa-install-dismissed";

interface PwaContextValue {
  /** Estado atual da instalação no dispositivo/navegador. */
  status: PwaStatus;
  /** True por alguns segundos logo após instalar com sucesso. */
  justInstalled: boolean;
  /** True se o usuário dispensou o card automático (persistido em localStorage). */
  dismissed: boolean;
  /** True quando há um caminho de instalação real disponível (Android/Chrome ou iOS). */
  canInstall: boolean;
  /** Dispara o prompt nativo de instalação (Android/Chrome). */
  promptInstall: () => Promise<void>;
  /** Persiste a dispensa do card automático — não impede a instalação manual pelo Perfil. */
  dismiss: () => void;
}

const PwaContext = createContext<PwaContextValue | null>(null);

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

/**
 * Provider único da lógica de instalação do PWA.
 *
 * Deve ser montado na raiz da aplicação (uma só vez). Isso garante que o evento
 * `beforeinstallprompt` — que o navegador dispara uma única vez no carregamento —
 * seja capturado em um único lugar e compartilhado por todos os consumidores
 * (card de instalação, botão do Perfil, etc.), evitando implementações duplicadas
 * e o problema de uma instância montada tardiamente nunca receber o evento.
 */
export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<PwaStatus>("unsupported");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Calcula status real e lê a preferência salva apenas no cliente, após hydration.
  // O setState síncrono aqui é intencional: `window`/`navigator`/`localStorage` não
  // existem no servidor, então o estado inicial é "unsupported" (igual ao SSR) e só
  // é sincronizado com a realidade do cliente após a montagem, evitando hydration mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronização client-only pós-hydration (ver comentário acima)
    setStatus(getInitialPwaStatus());
    try {
      setDismissed(window.localStorage.getItem(DISMISS_STORAGE_KEY) === "1");
    } catch {
      // localStorage indisponível (modo privado, etc.) — segue sem persistência.
    }
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

  /** Persiste a escolha de não ver mais o card automático. */
  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, "1");
    } catch {
      // Sem persistência — ao menos some na sessão atual.
    }
  }, []);

  const value = useMemo<PwaContextValue>(
    () => ({
      status,
      justInstalled,
      dismissed,
      canInstall: status === "available" || status === "ios",
      promptInstall,
      dismiss,
    }),
    [status, justInstalled, dismissed, promptInstall, dismiss],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

/**
 * Acessa a lógica compartilhada de instalação do PWA.
 * Requer que `<PwaProvider>` esteja montado acima na árvore.
 */
export function usePwa(): PwaContextValue {
  const ctx = useContext(PwaContext);
  if (!ctx) {
    throw new Error("usePwa deve ser usado dentro de <PwaProvider>.");
  }
  return ctx;
}
