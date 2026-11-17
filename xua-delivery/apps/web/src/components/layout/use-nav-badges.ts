"use client";

import { useIncomingOrdersCount } from "@/src/hooks/distributor/use-incoming-orders-count";
import { useIsClient } from "@/src/hooks/use-is-client";
import type { UserRole } from "@/src/lib/role-utils";
import { useCartStore } from "@/src/store/cart";

/** Contadores por item de menu (`href` → quantidade). Zero = sem badge. */
export function useNavBadges(role: UserRole): Record<string, number> {
  const cartTotal = useCartStore((s) => s.getTotalItems());
  const mounted = useIsClient();
  const incoming = useIncomingOrdersCount(role === "distributor_admin");

  if (role === "consumer") return { "/cart": mounted ? cartTotal : 0 };
  if (role === "distributor_admin") return { "/distributor/queue": incoming };
  return {};
}
