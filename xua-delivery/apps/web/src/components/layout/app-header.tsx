"use client";

import { Fragment } from "react";
import Link from "next/link";
import { RealtimeIndicator } from "@/src/realtime/realtime-indicator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/src/components/ui/breadcrumb";
import { Separator } from "@/src/components/ui/separator";
import { SidebarTrigger } from "@/src/components/ui/sidebar";
import { CommandPalette } from "./command-palette";
import { ConsumerAddress } from "./consumer-address";
import type { NavItem } from "./nav-config";
import { buildCrumbs } from "./route-titles";

interface AppHeaderProps {
  pathname: string;
  items: NavItem[];
  isConsumer: boolean;
}

/** Header do desktop (≥ 768px): 56px, sticky, vidro fosco. Gatilho da sidebar, breadcrumb e busca ⌘K. */
export function AppHeader({ pathname, items, isConsumer }: AppHeaderProps) {
  const crumbs = buildCrumbs(pathname, items);

  return (
    <header className="sticky top-0 z-30 hidden h-14 shrink-0 items-center gap-2 border-b border-hairline bg-background/80 px-4 backdrop-blur supports-backdrop-filter:bg-background/70 md:flex">
      <SidebarTrigger aria-label="Abrir ou recolher o menu" />
      <Separator orientation="vertical" className="mx-1 h-4 self-center!" />
      {isConsumer ? (
        <ConsumerAddress />
      ) : (
        <Breadcrumb className="min-w-0">
          <BreadcrumbList>
            {crumbs.map((crumb, index) => (
              <Fragment key={`${crumb.label}-${index}`}>
                {index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem>
                  {index === crumbs.length - 1 ? (
                    <BreadcrumbPage className="text-[13px]">{crumb.label}</BreadcrumbPage>
                  ) : crumb.href ? (
                    <BreadcrumbLink asChild className="text-[13px]">
                      <Link href={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <span className="text-[13px] text-muted-foreground">{crumb.label}</span>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="ml-auto flex items-center gap-3">
        {isConsumer ? null : <RealtimeIndicator />}
        <CommandPalette items={items} />
      </div>
    </header>
  );
}
