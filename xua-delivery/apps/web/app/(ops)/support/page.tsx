"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/src/components/shared/status-pill";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import type { Order } from "@/src/types";

interface SearchResult extends Order {
  consumer_name: string;
  consumer_email: string;
  consumer_phone: string;
}

export default function SupportPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orders?scope=support&q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      setResults(data.orders ?? []);
    } catch {
      // handle silently
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold font-heading text-foreground">Suporte</h1>

      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="Buscar por telefone, e-mail ou ID do pedido"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-xl border-0 bg-[#e1e3e4]"
        />
        <Button type="submit" disabled={loading} className="rounded-xl bg-[#C8F708] hover:bg-[#C8F708]/90 text-[#1a2600] font-semibold shadow-none active:scale-[0.98]">
          {loading ? "..." : "Buscar"}
        </Button>
      </form>

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((order) => (
            <Link key={order.id} href={`/support/${order.id}`}>
              <div className="rounded-2xl bg-white/95 p-3 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm hover:shadow-[0_4px_16px_rgba(0,26,64,0.10)] transition-shadow space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm font-heading">Pedido #{order.id}</p>
                  <StatusPill status={order.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {order.consumer_name} — {order.consumer_email} — {order.consumer_phone}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && results.length === 0 && query && (
        <p className="text-muted-foreground text-sm">Nenhum resultado encontrado.</p>
      )}
    </div>
  );
}
