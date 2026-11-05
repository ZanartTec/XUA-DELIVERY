"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/src/components/ui/drawer";
import { useIsDesktop } from "@/src/hooks/use-media-query";
import { cn } from "@/src/lib/utils";

interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Ações (ficam na base do sheet no mobile). */
  footer?: React.ReactNode;
  className?: string;
}

/** Bottom sheet (Drawer) no mobile, Dialog centralizado no desktop. */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: ResponsiveDialogProps) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn("max-h-[85dvh] overflow-y-auto sm:max-w-md", className)}>
          <DialogHeader>
            <DialogTitle className="font-heading">{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {children}
          {footer ? <DialogFooter>{footer}</DialogFooter> : null}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={cn("max-h-[90dvh]", className)}>
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-heading text-lg">{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : null}
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-2">{children}</div>
        {footer ? (
          <DrawerFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">{footer}</DrawerFooter>
        ) : (
          <div className="h-[env(safe-area-inset-bottom)]" />
        )}
      </DrawerContent>
    </Drawer>
  );
}
