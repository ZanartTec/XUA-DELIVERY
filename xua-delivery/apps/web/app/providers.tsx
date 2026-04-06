"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Toaster } from "@/src/components/ui/sonner";
import { PwaInstallPrompt } from "@/src/components/shared/pwa-install-prompt";
import { useAuthStore } from "@/src/store/auth";

function AuthHydrator() {
  const didRun = useRef(false);
  const setUser = useAuthStore((state) => state.setUser);
  const setHydrated = useAuthStore((state) => state.setHydrated);

  useEffect(() => {
    if (didRun.current) {
      return;
    }

    didRun.current = true;

    fetch("/api/auth/me", {
      credentials: "include",
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data?.consumer) {
          return;
        }

        setUser({
          id: data.consumer.id,
          name: data.consumer.name,
          role: data.consumer.role,
        });
      })
      .catch(() => {})
      .finally(() => {
        setHydrated();
      });
  }, [setHydrated, setUser]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
          },
        },
      })
  );

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthHydrator />
      {children}
      <Toaster position="top-center" richColors />
      <PwaInstallPrompt />
    </QueryClientProvider>
  );
}
