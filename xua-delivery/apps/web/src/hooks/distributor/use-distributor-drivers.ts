import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";

export interface DistributorDriver {
  id: string;
  name: string;
  email?: string;
  phone?: string | null;
  is_active?: boolean;
}

export const DISTRIBUTOR_DRIVERS_KEY = ["distributor-drivers"] as const;

/**
 * Motoristas da distribuidora logada. Fila, checklist e cadastro compartilham
 * este cache — por isso o formato (sempre um array) fica definido num só lugar.
 */
export function useDistributorDrivers(options: { activeOnly?: boolean } = {}) {
  return useQuery({
    queryKey: DISTRIBUTOR_DRIVERS_KEY,
    queryFn: async () =>
      (await api.get<{ drivers?: DistributorDriver[] }>("/api/distributor/drivers")).drivers ?? [],
    select: options.activeOnly ? (list: DistributorDriver[]) => list.filter((d) => d.is_active !== false) : undefined,
  });
}
