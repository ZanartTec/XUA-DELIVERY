"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";

import { usePwa } from "@/src/hooks/use-pwa";
import { useIsClient } from "@/src/hooks/use-is-client";
import { Button } from "@/src/components/ui/button";
import { PwaIosInstructionsSheet } from "@/src/components/shared/pwa-ios-instructions-sheet";

/**
 * Card de aquisição/conversão para instalar o PWA.
 *
 * Flutua no topo da tela (estilo notificação), sobrepondo o conteúdo. Ao ser
 * dispensado, a preferência é persistida (via `usePwa().dismiss`) e o card não
 * reaparece automaticamente — a instalação segue acessível pelo Perfil.
 */
export function PwaInstallPrompt() {
  const { status, justInstalled, dismissed, promptInstall, dismiss } = usePwa();
  const isClient = useIsClient();
  const [isIosSheetOpen, setIsIosSheetOpen] = useState(false);
  // Auto-fechamento temporário (não persiste): some sozinho se o usuário não interagir.
  const [autoHidden, setAutoHidden] = useState(false);

  useEffect(() => {
    if (justInstalled) {
      toast.success("App instalado com sucesso!", {
        description: "Acesse o Xuá diretamente pela sua tela inicial.",
        duration: 5000,
      });
    }
  }, [justInstalled]);

  // Fecha o card automaticamente após 10s caso o usuário não o feche manualmente.
  // Diferente do X (que persiste), isto apenas oculta para não ficar permanente.
  useEffect(() => {
    const willShow =
      isClient && !dismissed && (status === "available" || status === "ios");
    if (!willShow) return;

    const timer = setTimeout(() => setAutoHidden(true), 10_000);
    return () => clearTimeout(timer);
  }, [isClient, dismissed, status]);

  if (!isClient) {
    return null;
  }

  // Respeita a dispensa persistida, o auto-fechamento e os estados sem instalação possível.
  if (autoHidden || dismissed || status === "installed" || status === "unsupported" || status === "dismissed") {
    return null;
  }

  const showBanner = status === "available" || status === "ios";
  if (!showBanner) return null;

  return (
    <>
      {/* --------------------------------------------------------------
          Notificação flutuante ancorada no topo, SOBREPONDO o header.
          z acima do header (z-50) + animação de "descida" estilo notificação.
      -------------------------------------------------------------- */}
      <div
        className="fixed top-[calc(0.5rem+env(safe-area-inset-top))] inset-x-0 z-[60] flex justify-center px-3 pointer-events-none"
        role="banner"
        aria-label="Instalar aplicativo"
      >
        <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 max-w-sm w-full pointer-events-auto bg-white/40 backdrop-blur-xl supports-backdrop-filter:bg-white/35 border border-[#00E0FF]/35 ring-1 ring-white/50 shadow-[0_8px_28px_-8px_rgba(0,26,64,0.25)] animate-in slide-in-from-top-16 fade-in zoom-in-95 duration-500 ease-out">
          {/* Ícone da marca Xuá */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#00E0FF]/15 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon.svg" alt="Xuá" className="h-6 w-6 object-contain" />
          </div>

          {/* Texto */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground leading-tight">Instalar o Xuá</p>
            <p className="text-xs text-muted-foreground leading-tight">Offline · mais rápido</p>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              className="h-7 border-[#00E0FF] bg-[#00E0FF] px-3 text-xs font-semibold text-[#001735] hover:bg-[#00C9E6] hover:text-[#001735]"
              onClick={status === "ios" ? () => setIsIosSheetOpen(true) : promptInstall}
            >
              Instalar
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={dismiss}
              aria-label="Dispensar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Instruções de instalação no iOS (Safari) — componente compartilhado */}
      <PwaIosInstructionsSheet open={isIosSheetOpen} onOpenChange={setIsIosSheetOpen} />
    </>
  );
}
