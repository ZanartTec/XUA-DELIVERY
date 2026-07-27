import { AlertTriangle, CalendarClock, Clock } from "lucide-react";
import { cn } from "@/src/lib/utils";
import type { DeliveryUrgency } from "@/src/lib/order-detail-format";

const LEVEL_STYLES: Record<string, string> = {
  overdue: "bg-red-100 text-red-800",
  urgent: "bg-amber-100 text-amber-800",
  soon: "bg-yellow-50 text-yellow-800",
  normal: "bg-[#eef2f7] text-[#475569]",
};

const LEVEL_ICON = {
  overdue: AlertTriangle,
  urgent: Clock,
  soon: CalendarClock,
  normal: CalendarClock,
} as const;

export function DeliveryUrgencyBadge({ urgency, className }: { urgency: DeliveryUrgency; className?: string }) {
  if (urgency.level === "none") return null;
  const Icon = LEVEL_ICON[urgency.level];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold",
        LEVEL_STYLES[urgency.level],
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {urgency.label}
    </span>
  );
}
