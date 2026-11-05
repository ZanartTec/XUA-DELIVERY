"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  /** Linha pequena acima do título (contexto, etapa). */
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  /** Voltar: `true` usa o histórico; string navega para a rota. */
  back?: boolean | string;
  /** Ação secundária à direita (ícone/menu). A ação primária vai no StickyActionBar. */
  actions?: React.ReactNode;
  /** Filtros/abas sob o título; ficam sticky junto com ele. */
  children?: React.ReactNode;
  /** Gruda no topo, abaixo do header do app. */
  sticky?: boolean;
  className?: string;
}

/**
 * Cabeçalho padrão das telas (zona de topo: título, voltar, filtros).
 * Substitui as variações "eyebrow + título", hero azul "ETAPA 0X" e "← Xuá ⚡".
 */
export function PageHeader({
  title,
  eyebrow,
  description,
  back,
  actions,
  children,
  sticky = false,
  className,
}: PageHeaderProps) {
  const router = useRouter();

  return (
    <header
      data-slot="page-header"
      className={cn(
        "bg-background/95 px-4 pt-4 pb-3 backdrop-blur supports-backdrop-filter:bg-background/80",
        sticky && "sticky top-(--app-header-h,0px) z-30",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-3xl items-start gap-2">
        {back ? (
          typeof back === "string" ? (
            <Button asChild variant="ghost" size="icon-touch" className="-ml-2 shrink-0">
              <Link href={back} aria-label="Voltar">
                <ArrowLeft />
              </Link>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-touch"
              className="-ml-2 shrink-0"
              aria-label="Voltar"
              onClick={() => router.back()}
            >
              <ArrowLeft />
            </Button>
          )
        ) : null}

        <div className={cn("min-w-0 flex-1", back && "pt-1.5")}>
          {eyebrow ? (
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>
          ) : null}
          <h1 className="font-heading text-xl leading-tight font-bold text-ink md:text-2xl">{title}</h1>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>

        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>

      {children ? <div className="mx-auto mt-3 w-full max-w-3xl">{children}</div> : null}
    </header>
  );
}
