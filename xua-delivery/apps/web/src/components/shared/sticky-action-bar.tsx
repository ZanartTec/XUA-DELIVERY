import { cn } from "@/src/lib/utils";

interface StickyActionBarProps {
  children: React.ReactNode;
  /** Resumo curto acima/ao lado do CTA (ex.: total). */
  summary?: React.ReactNode;
  className?: string;
}

/**
 * Ação primária da tela fixada na zona do polegar, logo acima do bottom nav
 * (no desktop, abaixo do conteúdo, alinhada à coluna). Renderiza um espaçador
 * para o último item da página não ficar escondido atrás da barra.
 */
export function StickyActionBar({ children, summary, className }: StickyActionBarProps) {
  return (
    <>
      <div aria-hidden className="h-28 md:h-24" />
      <div
        data-slot="sticky-action-bar"
        className={cn(
          "fixed inset-x-0 bottom-(--bottom-nav-h,0px) z-40 border-t border-hairline bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/85",
          "md:left-(--app-sidebar-w,0px)",
          className,
        )}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          {summary ? <div className="text-sm text-muted-foreground">{summary}</div> : null}
          <div className="flex items-center gap-2 [&>*]:flex-1">{children}</div>
        </div>
      </div>
    </>
  );
}
