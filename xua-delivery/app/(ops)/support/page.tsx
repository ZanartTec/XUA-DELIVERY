"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/src/components/shared/status-pill";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Card, CardContent } from "@/src/components/ui/card";
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
      <h1 className="text-xl font-bold">Suporte</h1>

      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="Buscar por telefone, e-mail ou ID do pedido"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={loading}>
          {loading ? "..." : "Buscar"}
        </Button>
      </form>

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((order) => (
            <Link key={order.id} href={`/support/${order.id}`}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">Pedido #{order.id}</p>
                    <StatusPill status={order.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {order.consumer_name} — {order.consumer_email} — {order.consumer_phone}
                  </p>
                </CardContent>
              </Card>
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
