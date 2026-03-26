"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/src/lib/utils";
import { Droplets, BarChart3, Headphones, KeyRound, FileText, Menu, MapPin } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/src/components/ui/sheet";

const SIDEBAR_ITEMS = [
  { href: "/ops/kpis", label: "KPIs", icon: BarChart3 },
  { href: "/ops/support", label: "Suporte", icon: Headphones },
  { href: "/ops/otp-override", label: "OTP Override", icon: KeyRound },
  { href: "/ops/audit", label: "Auditoria", icon: FileText },
];

function SidebarContent({ pathname }: { pathname: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 px-3 mb-6">
        <Droplets className="h-7 w-7 text-accent" />
        <span className="text-xl font-bold text-primary">Xuá</span>
      </div>
      <p className="px-3 mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Operações</p>
      {SIDEBAR_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              isActive
                ? "bg-accent/10 text-accent font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-card p-4">
        <SidebarContent pathname={pathname} />
      </aside>
      <div className="flex-1 flex flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-50 flex items-center gap-3 border-b bg-white/95 backdrop-blur px-4 h-14 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <SidebarContent pathname={pathname} />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-accent" />
            <span className="font-bold text-primary">Xuá Ops</span>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
