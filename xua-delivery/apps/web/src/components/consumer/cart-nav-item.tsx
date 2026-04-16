"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useCartStore } from "@/src/store/cart";

interface CartNavItemProps {
  active: boolean;
}

/**
 * Dedicated nav bar item for the cart with three visual states:
 *  1. Empty + inactive  → muted (same as other nav items)
 *  2. Has items + inactive → accent tint to draw attention
 *  3. Active (on cart page) → primary filled state
 *
 * The badge uses the brand primary colour with a pop-in animation.
 */
export function CartNavItem({ active }: CartNavItemProps) {
  const totalItems = useCartStore((s) => s.getTotalItems());
  const hasItems = totalItems > 0;
  const badgeText = totalItems > 99 ? "99+" : String(totalItems);

  return (
    <Link
      href="/cart"
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-center transition-colors duration-200",
        active
          ? "text-primary"
          : hasItems
            ? "text-primary/80 hover:text-primary"
            : "text-muted-foreground hover:text-foreground",
      )}
    >
      {/* Icon wrapper — contains badge */}
      <span className="relative inline-flex">
        <ShoppingCart
          className={cn(
            "h-5 w-5 transition-colors duration-200",
            active && "fill-primary/15",
            hasItems && !active && "fill-primary/10",
          )}
        />

        {/* Badge */}
        {hasItems && (
          <span
            key={totalItems}
            className={cn(
              "absolute -top-1.5 -right-2.5",
              "flex h-4 min-w-4 items-center justify-center rounded-full px-0.75",
              "bg-primary text-[9px] font-bold leading-none text-accent",
              "ring-2 ring-white",
              "animate-badge-pop",
            )}
          >
            {badgeText}
          </span>
        )}
      </span>

      {/* Label */}
      <span
        className={cn(
          "text-[10px] leading-tight transition-colors duration-200",
          active && "font-semibold",
          hasItems && !active && "font-medium",
        )}
      >
        Carrinho
      </span>
    </Link>
  );
}
