"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/src/lib/utils";

const SIDEBAR_ITEMS = [
  { href: "/ops/zones", label: "Zonas" },
  { href: "/ops/kpis", label: "KPIs" },
  { href: "/support", label: "Suporte" },
  { href: "/ops/otp-override", label: "OTP Override" },
  { href: "/ops/audit-export", label: "Auditoria" },
];

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:flex w-64 flex-col border-r bg-white p-4 gap-1">
        <h2 className="text-lg font-bold mb-4">Operações</h2>
        {SIDEBAR_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm",
              pathname.startsWith(item.href)
                ? "bg-blue-50 text-blue-700 font-medium"
                : "text-gray-600 hover:bg-gray-50"
            )}
          >
            {item.label}
          </Link>
        ))}
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
