"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { offlineQueue, type OfflineAction } from "@/src/lib/offline-queue";

interface SyncProgress {
  total: number;
  processed: number;
  errors: number;
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  // Atualiza status online/offline
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Conta pendentes
  const refreshCount = useCallback(async () => {
    const count = await offlineQueue.count();
    setPendingCount(count);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const count = await offlineQueue.count();
      if (active) {
        setPendingCount(count);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // Enfileira ação offline
  const enqueue = useCallback(
    async (action: Omit<OfflineAction, "id" | "createdAt">) => {
      const full: OfflineAction = {
        ...action,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      };
      await offlineQueue.enqueue(full);
      await refreshCount();
    },
    [refreshCount]
  );

  // Sincroniza fila com servidor
  const sync = useCallback(async (): Promise<SyncProgress> => {
    if (syncingRef.current || !navigator.onLine) {
      return { total: 0, processed: 0, errors: 0 };
    }

    syncingRef.current = true;
    setSyncing(true);

    const actions = await offlineQueue.dequeueAll();
    const progress: SyncProgress = { total: actions.length, processed: 0, errors: 0 };

    for (const action of actions) {
      try {
        const res = await fetch(action.url, {
          method: action.method,
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ...action.body, idempotencyKey: action.id }),
        });
        if (res.ok || res.status === 409) {
          // 409 = já processado (idempotente)
          await offlineQueue.remove(action.id);
          progress.processed++;
        } else {
          progress.errors++;
        }
      } catch {
        progress.errors++;
      }
    }

    syncingRef.current = false;
    setSyncing(false);
    await refreshCount();
    return progress;
  }, [refreshCount]);

  // Auto-sync ao reconectar
  useEffect(() => {
    if (!(isOnline && pendingCount > 0)) return;
    const timer = window.setTimeout(() => {
      void sync();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isOnline, pendingCount, sync]);

  // Escuta mensagem do Service Worker para disparar sync
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "SYNC_QUEUE" && navigator.onLine) {
        sync();
      }
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [sync]);

  // Registra Background Sync quando há itens na fila
  const registerBackgroundSync = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("SyncManager" in window)) return;
    const reg = await navigator.serviceWorker.ready;
    if ("sync" in reg) {
      await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register("xua-sync-queue");
    }
  }, []);

  const enqueueWithSync = useCallback(
    async (action: Omit<OfflineAction, "id" | "createdAt">) => {
      await enqueue(action);
      await registerBackgroundSync();
    },
    [enqueue, registerBackgroundSync]
  );

  return { isOnline, pendingCount, syncing, enqueue: enqueueWithSync, sync, refreshCount };
}
