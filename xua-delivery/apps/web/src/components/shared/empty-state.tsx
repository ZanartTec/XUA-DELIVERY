import type { LucideIcon } from "lucide-react";
import { cn } from "@/src/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Botão/link para sair do vazio. */
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}
    >
      {Icon ? (
        <div className="flex size-16 items-center justify-center rounded-full bg-sky/10">
          <Icon className="size-8 text-sky" aria-hidden />
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="font-heading text-base font-semibold text-ink">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
