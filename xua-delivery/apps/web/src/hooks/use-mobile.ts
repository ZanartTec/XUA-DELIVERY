"use client";

import { useMediaQuery } from "./use-media-query";

/**
 * Abaixo de 768px o app usa bottom nav (sem sidebar). Usado pelo componente `Sidebar`
 * para decidir entre a barra fixa do desktop e o `Sheet` do celular.
 */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
