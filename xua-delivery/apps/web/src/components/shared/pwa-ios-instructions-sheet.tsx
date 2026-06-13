"use client";

import { Share2, Plus } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/src/components/ui/sheet";

/**
 * Sheet com o passo a passo de instalação no iOS (Safari não expõe prompt nativo).
 *
 * Componente compartilhado entre o card de instalação e o botão do Perfil —
 * a lógica de instalação é única (ver `usePwa`); aqui ficam apenas as instruções.
 */
export function PwaIosInstructionsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
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
              <p className="text-sm font-semibold">Confirme tocando em &quot;Adicionar&quot;</p>
              <p className="text-xs text-muted-foreground mt-1">
                O ícone do Xuá aparecerá na sua tela inicial.
              </p>
            </div>
          </li>
        </ol>

        <Button className="w-full h-11 text-base font-semibold" onClick={() => onOpenChange(false)}>
          Entendido
        </Button>
      </SheetContent>
    </Sheet>
  );
}
