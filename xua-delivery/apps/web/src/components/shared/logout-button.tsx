"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { useAuthStore } from "@/src/store/auth";

interface LogoutButtonProps {
  variant?: "icon" | "full";
  className?: string;
}

export function LogoutButton({ variant = "icon", className }: LogoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      logout();
      router.push("/login");
    }
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
