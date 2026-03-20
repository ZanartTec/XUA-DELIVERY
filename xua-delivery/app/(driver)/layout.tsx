"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/src/lib/utils";
import { OfflineBanner } from "@/src/components/shared/offline-banner";

const NAV_ITEMS = [
  { href: "/driver/deliveries", label: "Entregas" },
];

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <OfflineBanner />
      <header className="sticky top-0 z-40 border-b bg-white px-4 py-3 flex items-center gap-4">
        <h1 className="text-lg font-bold">Motorista</h1>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "text-sm",
              pathname.startsWith(item.href)
                ? "text-blue-600 font-semibold"
                : "text-gray-500"
            )}
          >
            {item.label}
          </Link>
        ))}
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
