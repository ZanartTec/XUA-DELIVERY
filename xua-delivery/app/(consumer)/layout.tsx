"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/src/lib/utils";
import { OfflineBanner } from "@/src/components/shared/offline-banner";

const NAV_ITEMS = [
  { href: "/catalog", label: "Catálogo" },
  { href: "/cart", label: "Carrinho" },
  { href: "/orders", label: "Pedidos" },
  { href: "/subscription/manage", label: "Assinatura" },
  { href: "/profile", label: "Perfil" },
];

export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <OfflineBanner />
      <main className="flex-1 pb-20">{children}</main>
      <nav className="fixed bottom-0 inset-x-0 z-40 border-t bg-white">
        <ul className="flex justify-around py-2">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 text-xs",
                  pathname.startsWith(item.href)
                    ? "text-blue-600 font-semibold"
                    : "text-gray-500"
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
