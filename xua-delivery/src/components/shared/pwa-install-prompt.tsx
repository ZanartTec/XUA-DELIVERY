"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Share2, X, Plus } from "lucide-react";

import { usePwa } from "@/src/hooks/use-pwa";
import { Button } from "@/src/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/src/components/ui/sheet";

export function PwaInstallPrompt() {
  const { status, justInstalled, promptInstall } = usePwa();
  const [isIosSheetOpen, setIsIosSheetOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (justInstalled) {
      toast.success("App instalado com sucesso!", {
        description: "Acesse o Xuá diretamente pela sua tela inicial.",
        duration: 5000,
      });
    }
  }, [justInstalled]);

  // Oculta o banner se já instalado, sem suporte, recusado ou manualmente dispensado
  if (isDismissed || status === "installed" || status === "unsupported" || status === "dismissed") {
    return null;
  }

  const showBanner = status === "available" || status === "ios";
  if (!showBanner) return null;

  return (
    <>
      {/* ──────────────────────────────────────────────────────────────
          Banner flutuante acima da bottom navigation (4rem ≈ nav height)
      ────────────────────────────────────────────────────────────── */}
      <div
        className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] inset-x-0 z-30 flex justify-center px-4 pointer-events-none"
        role="banner"
        aria-label="Instalar aplicativo"
      >
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl shadow-sm px-3 py-2 max-w-sm w-full pointer-events-auto animate-in slide-in-from-bottom-4 duration-300">
          {/* Texto */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground leading-tight">Instalar o Xuá</p>
            <p className="text-xs text-muted-foreground leading-tight">Offline · mais rápido</p>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2"
              onClick={status === "ios" ? () => setIsIosSheetOpen(true) : promptInstall}
            >
              <Download className="h-3 w-3 mr-1" />
              Instalar
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setIsDismissed(true)}
              aria-label="Dispensar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────
          Sheet com instruções de instalação no iOS (Safari)
      ────────────────────────────────────────────────────────────── */}
      <Sheet open={isIosSheetOpen} onOpenChange={setIsIosSheetOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl px-6 pb-8 pt-0"
          style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
        >
          {/* Alça visual */}
          <div className="mx-auto mt-3 mb-6 h-1.5 w-10 rounded-full bg-muted-foreground/25" />

          <SheetHeader className="mb-6 text-left">
            <SheetTitle className="flex items-center gap-2 text-lg">
              Instalar no iPhone / iPad
            </SheetTitle>
            <SheetDescription>
              O Safari não exibe um botão de instalação automático. Siga os passos abaixo.
            </SheetDescription>
          </SheetHeader>

          <ol className="space-y-5 mb-8">
            {/* Passo 1 */}
            <li className="flex items-start gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0 mt-0.5">
                1
              </span>
              <div>
                <p className="text-sm font-semibold">Toque no ícone de compartilhar</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Share2 className="h-3.5 w-3.5 shrink-0" />
                  Ícone de caixa com seta para cima — barra inferior do Safari
                </p>
              </div>
            </li>

            {/* Passo 2 */}
            <li className="flex items-start gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0 mt-0.5">
                2
              </span>
              <div>
                <p className="text-sm font-semibold">Role para baixo e toque em</p>
                <p className="inline-flex items-center gap-1 text-xs font-medium mt-1 bg-muted rounded-md px-2 py-1">
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar à Tela de Início
                </p>
              </div>
            </li>

            {/* Passo 3 */}
            <li className="flex items-start gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0 mt-0.5">
                3
              </span>
              <div>
                <p className="text-sm font-semibold">Confirme tocando em "Adicionar"</p>
                <p className="text-xs text-muted-foreground mt-1">
                  O ícone do Xuá aparecerá na sua tela inicial.
                </p>
              </div>
            </li>
          </ol>

          <Button className="w-full h-11 text-base font-semibold" onClick={() => setIsIosSheetOpen(false)}>
            Entendido
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
}
