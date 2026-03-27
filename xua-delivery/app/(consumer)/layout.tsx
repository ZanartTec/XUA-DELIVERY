"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/src/lib/utils";
import { OfflineBanner } from "@/src/components/shared/offline-banner";
import { Droplets, ShoppingCart, ClipboardList, RefreshCw, User, Bell } from "lucide-react";
import { useAuthStore } from "@/src/store/auth";
import { Button } from "@/src/components/ui/button";

const NAV_ITEMS = [
  { href: "/catalog", label: "Catálogo", icon: Droplets },
  { href: "/cart", label: "Carrinho", icon: ShoppingCart },
  { href: "/orders", label: "Pedidos", icon: ClipboardList },
  { href: "/subscription/manage", label: "Assinatura", icon: RefreshCw },
  { href: "/profile", label: "Perfil", icon: User },
];

export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OfflineBanner />
      {/* Top header */}
      <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <Droplets className="h-6 w-6 text-accent" />
            <span className="text-lg font-bold text-primary">Xuá</span>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <span className="text-sm text-muted-foreground hidden sm:block">
                Olá, {user.name.split(" ")[0]}
              </span>
            )}
            <Button variant="ghost" size="icon" className="text-muted-foreground">
              <Bell className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 pb-20">{children}</main>
      {/* Bottom navigation */}
      <nav className="fixed bottom-0 inset-x-0 z-40 border-t bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 pb-[env(safe-area-inset-bottom)]">
        <ul className="flex justify-around py-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors",
                    isActive
                      ? "text-accent"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-5 w-5", isActive && "fill-accent/20")} />
                  <span className={cn("text-[10px]", isActive && "font-semibold")}>
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
