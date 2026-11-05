"use client";

import { useSyncExternalStore } from "react";

/**
 * `matchMedia` reativo. No servidor (e na hidratação) devolve `serverFallback`,
 * por padrão `false` = layout mobile, que é o caso majoritário do app.
 */
export function useMediaQuery(query: string, serverFallback = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverFallback,
  );
}

/** Breakpoint `md` do Tailwind (768px): a partir daqui o app usa layout desktop. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}
