"use client";

import { cn } from "@/src/lib/utils";
import { StatusPill } from "@/src/components/shared/status-pill";

export interface TimelineEvent {
  status: string;
  timestamp: string;
  actor?: string;
}

interface OrderTimelineProps {
  events: TimelineEvent[];
  className?: string;
}

export function OrderTimeline({ events, className }: OrderTimelineProps) {
  return (
    <ol className={cn("relative border-l border-gray-200 ml-3", className)}>
      {events.map((event, i) => {
        const isLast = i === events.length - 1;
        return (
          <li key={`${event.status}-${event.timestamp}`} className="mb-6 ml-6 last:mb-0">
            <span
              className={cn(
                "absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white",
                isLast ? "bg-blue-600" : "bg-gray-400"
              )}
            />
            <div className="flex flex-col gap-1">
              <StatusPill status={event.status} />
              <time className="text-xs text-gray-500">
                {new Date(event.timestamp).toLocaleString("pt-BR")}
              </time>
              {event.actor && (
                <span className="text-xs text-gray-400">{event.actor}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
