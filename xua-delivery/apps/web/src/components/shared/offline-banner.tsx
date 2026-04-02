"use client";

import { cn } from "@/src/lib/utils";
import { useOfflineSync } from "@/src/hooks/use-offline-sync";
import { useIsClient } from "@/src/hooks/use-is-client";

export function OfflineBanner({ className }: { className?: string }) {
  const { isOnline, pendingCount, syncing } = useOfflineSync();
  const isClient = useIsClient();

  if (!isClient) return null;

  if (isOnline && !syncing) return null;

  return (
    <div
      className={cn(
        "fixed top-0 inset-x-0 z-50 text-center py-2 text-sm font-medium",
        syncing ? "bg-blue-500 text-white" : "bg-yellow-500 text-yellow-950",
        className
      )}
    >
      {syncing ? (
        "Sincronizando dados..."
      ) : (
        <>
          Você está offline
          {pendingCount > 0 && (
            <span className="ml-2">
              ({pendingCount} {pendingCount === 1 ? "ação pendente" : "ações pendentes"})
            </span>
          )}
        </>
      )}
    </div>
  );
}
