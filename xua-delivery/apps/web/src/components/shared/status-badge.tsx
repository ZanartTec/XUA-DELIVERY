import { Badge } from "@/src/components/ui/badge";
import { opsStatusLabel, orderStatusMeta, type StatusTone } from "@/src/lib/order-status";
import { cn } from "@/src/lib/utils";

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-surface-high text-muted-foreground",
  info: "bg-secondary text-primary",
  progress: "bg-sky/15 text-primary",
  warning: "bg-warning-surface text-warning-foreground",
  success: "bg-success-surface text-success-foreground",
  danger: "bg-danger-surface text-destructive",
};

interface StatusBadgeProps {
  /** Status de pedido (usa o rótulo/tom padrão)… */
  status?: string;
  /** …ou rótulo e tom livres (assinaturas, entregas, pagamentos). */
  label?: React.ReactNode;
  tone?: StatusTone;
  /** "ops": rótulos para quem opera o pedido (distribuidora, motorista, central). */
  audience?: "consumer" | "ops";
  className?: string;
}

export function StatusBadge({ status, label, tone, audience = "consumer", className }: StatusBadgeProps) {
  const meta = status ? orderStatusMeta(status) : null;
  const resolvedTone = tone ?? meta?.tone ?? "neutral";
  return (
    <Badge variant="secondary" className={cn("h-6 px-2.5 font-semibold", TONE_CLASS[resolvedTone], className)}>
      {label ?? (status && audience === "ops" ? opsStatusLabel(status) : meta?.label)}
    </Badge>
  );
}
