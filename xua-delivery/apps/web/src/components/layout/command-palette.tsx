"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { groupNavItems, type NavItem } from "./nav-config";

/** ⌘K / Ctrl K: navegação rápida pelas telas do perfil. */
export function CommandPalette({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-52 justify-start text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Search aria-hidden />
        Ir para…
        <kbd className="ml-auto font-mono text-[11px] text-muted-foreground">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Ir para" description="Busque uma tela">
        <CommandInput placeholder="Buscar tela…" />
        <CommandList>
          <CommandEmpty>Nenhuma tela encontrada.</CommandEmpty>
          {groupNavItems(items).map((group, index) => (
            <CommandGroup key={group.label ?? `grupo-${index}`} heading={group.label}>
              {group.items.map(({ href, label, icon: Icon }) => (
                <CommandItem key={href} value={`${group.label ?? ""} ${label}`} onSelect={() => go(href)}>
                  <Icon aria-hidden />
                  {label}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
