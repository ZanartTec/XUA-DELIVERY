"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/src/lib/utils";
import { OfflineBanner } from "@/src/components/shared/offline-banner";
import { Droplets, Truck, Package } from "lucide-react";

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OfflineBanner />
      <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <Droplets className="h-6 w-6 text-accent" />
            <span className="text-lg font-bold text-primary">Xuá</span>
            <span className="text-xs bg-accent/10 text-accent font-medium px-2 py-0.5 rounded-full">Motorista</span>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/driver/deliveries"
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors",
                pathname === "/driver/deliveries"
                  ? "bg-accent/10 text-accent font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Truck className="h-4 w-4" />
              Entregas
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
