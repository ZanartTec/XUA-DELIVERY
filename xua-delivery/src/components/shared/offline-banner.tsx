"use client";

import { useEffect, useState } from "react";
import { cn } from "@/src/lib/utils";

export function OfflineBanner({ className }: { className?: string }) {
  const [online, setOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    setOnline(navigator.onLine);

    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!online) {
      const stored = localStorage.getItem("xua-offline-queue");
      if (stored) {
        try {
          const queue = JSON.parse(stored);
          setQueueCount(Array.isArray(queue) ? queue.length : 0);
        } catch {
          setQueueCount(0);
        }
      }
    }
  }, [online]);

  if (online) return null;

  return (
    <div
      className={cn(
        "fixed top-0 inset-x-0 z-50 bg-yellow-500 text-yellow-950 text-center py-2 text-sm font-medium",
        className
      )}
    >
      Você está offline
      {queueCount > 0 && (
        <span className="ml-2">
          ({queueCount} {queueCount === 1 ? "ação pendente" : "ações pendentes"})
        </span>
      )}
    </div>
  );
}
