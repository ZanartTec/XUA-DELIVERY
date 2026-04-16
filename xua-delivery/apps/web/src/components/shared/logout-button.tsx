"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/src/components/ui/button";

interface LogoutButtonProps {
  variant?: "icon" | "full" | "nav";
  className?: string;
}

export function LogoutButton({ variant = "icon", className }: LogoutButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
    } finally {
      window.location.replace("/login");
    }
  }

  if (variant === "nav") {
    return (
      <button
        onClick={handleLogout}
        disabled={loading}
        className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 ${className ?? ""}`}
      >
        <LogOut className="h-5 w-5" />
        <span className="text-[10px] leading-tight font-medium">{loading ? "Saindo" : "Sair"}</span>
      </button>
    );
  }

  if (variant === "full") {
    return (
      <button
        onClick={handleLogout}
        disabled={loading}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors w-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 ${className ?? ""}`}
      >
        <LogOut className="h-4 w-4" />
        {loading ? "Saindo…" : "Sair"}
      </button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleLogout}
      disabled={loading}
      className={`text-muted-foreground ${className ?? ""}`}
      title="Sair"
    >
      <LogOut className="h-5 w-5" />
    </Button>
  );
}
