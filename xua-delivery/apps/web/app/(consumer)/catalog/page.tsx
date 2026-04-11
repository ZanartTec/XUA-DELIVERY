"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { useCartStore } from "@/src/store/cart";
import { formatCurrency } from "@/src/lib/utils";
import { Droplets, Plus, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { SearchBar } from "@/src/components/consumer/search-bar";
import { PromoBannerCarousel, type BannerSlide } from "@/src/components/consumer/promo-banner-carousel";
import { CategoryFilter, type CategoryValue } from "@/src/components/consumer/category-filter";
import { FeaturedProductCard, type FeaturedBanner } from "@/src/components/consumer/featured-product-card";

interface ProductItem {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_cents: number;
  deposit_cents: number;
  is_active: boolean;
}

function ProductSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-white/80 shadow-[0_2px_12px_rgba(0,26,64,0.06)]">
      <div className="h-36 rounded-t-2xl bg-[#e1e3e4]" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-2/3 rounded-lg bg-[#e1e3e4]" />
        <div className="h-3 w-1/2 rounded-lg bg-[#e1e3e4]" />
        <div className="flex items-center justify-between pt-1">
          <div className="h-5 w-16 rounded-lg bg-[#e1e3e4]" />
          <div className="h-8 w-8 rounded-full bg-[#e1e3e4]" />
        </div>
      </div>
    </div>
  );
}

/** Heurística para categorizar produto pelo nome/descrição */
function matchesCategory(product: ProductItem, category: CategoryValue): boolean {
  if (category === "all") return true;
  const text = `${product.name} ${product.description ?? ""}`.toLowerCase();
  switch (category) {
    case "mineral":
      return text.includes("mineral") || text.includes("água");
    case "gallons":
      return text.includes("galão") || text.includes("garrafão") || text.includes("20l");
    case "accessories":
      return text.includes("bomba") || text.includes("suporte") || text.includes("dispenser");
    case "premium":
      return text.includes("premium") || text.includes("pack");
    default:
      return true;
  }
}

export default function CatalogPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryValue>("all");
  const [carouselBanners, setCarouselBanners] = useState<BannerSlide[]>([]);
  const [featuredBanner, setFeaturedBanner] = useState<FeaturedBanner | null>(null);
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/products");
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Não foi possível carregar o catálogo.");
        }

        setProducts(data.products ?? []);
      } catch (err) {
        setProducts([]);
        setError(err instanceof Error ? err.message : "Não foi possível carregar o catálogo.");
      } finally {
        setLoading(false);
      }
    }

    async function loadBanners() {
      try {
        const res = await fetch("/api/banners");
        const data = await res.json();
        if (res.ok && data.banners) {
          const carousel = data.banners.filter((b: { type: string }) => b.type === "CAROUSEL");
          const featured = data.banners.find((b: { type: string }) => b.type === "FEATURED") ?? null;
          setCarouselBanners(carousel);
          setFeaturedBanner(featured);
        }
      } catch {
        // Silently fail — components use fallback data
      }
    }

    void loadProducts();
    void loadBanners();
  }, []);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        search.trim() === "" ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.description ?? "").toLowerCase().includes(search.toLowerCase());
      return matchSearch && matchesCategory(p, category);
    });
  }, [products, search, category]);

  function handleAdd(product: ProductItem) {
    addItem({
      product_id: product.id,
      product_name: product.name,
      unit_price_cents: product.price_cents,
      image_url: product.image_url,
    });
    toast.success(`${product.name} adicionado ao carrinho`);
  }

  return (
    <div className="space-y-5 pb-4">
      {/* Barra de busca */}
      <div className="mt-3">
        <SearchBar value={search} onChange={setSearch} />
      </div>

      {/* Banner carrossel */}
      <PromoBannerCarousel banners={carouselBanners} />

      {/* Filtros de categoria */}
      <CategoryFilter selected={category} onChange={setCategory} />

      {/* Seção destaques */}
      <div className="flex items-center justify-between px-4">
        <h2 className="text-lg font-bold font-heading text-[#191c1d]">Destaques da Semana</h2>
        <Link
          href="/catalog"
          className="text-xs font-bold uppercase tracking-wide text-primary"
        >
          Ver todos
        </Link>
      </div>

      {error && (
        <div className="mx-4 rounded-2xl bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <ProductSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <PackageOpen className="h-10 w-10 text-primary/40" />
          </div>
          <p className="text-[#434656]">Nenhum produto encontrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-4">
          {filtered.map((product) => (
            <div
              key={product.id}
              className="group overflow-hidden rounded-2xl bg-[#ffffff] shadow-[0_2px_12px_rgba(0,26,64,0.06)] transition-shadow hover:shadow-[0_4px_20px_rgba(0,26,64,0.10)]"
            >
              {/* Imagem */}
              <div className="relative h-36 bg-[#f3f4f5] flex items-center justify-center overflow-hidden">
                {product.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <Droplets className="h-10 w-10 text-primary/30" />
                )}
                {!product.is_active && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                    <span className="rounded-lg bg-white/90 px-2 py-1 text-[10px] font-bold text-destructive">
                      Indisponível
                    </span>
                  </div>
                )}
              </div>

              <div className="p-3 space-y-1">
                <h3 className="font-semibold text-sm leading-tight line-clamp-2 text-[#191c1d]">
                  {product.name}
                </h3>
                {product.description && (
                  <p className="text-xs text-[#737688] line-clamp-1">{product.description}</p>
                )}
                <div className="flex items-center justify-between pt-1.5">
                  <div className="flex flex-col">
                    {/* Preço fictício original riscado se tiver promoção */}
                    {product.price_cents < 2000 && (
                      <span className="text-[11px] text-[#737688] line-through">
                        {formatCurrency(Math.round(product.price_cents * 1.27))}
                      </span>
                    )}
                    <span className="text-base font-bold text-primary">
                      {formatCurrency(product.price_cents)}
                    </span>
                  </div>
                  <Button
                    size="icon"
                    className="h-9 w-9 rounded-full bg-primary hover:bg-primary-hover shadow-none hover:opacity-90 active:scale-95"
                    disabled={!product.is_active}
                    onClick={() => handleAdd(product)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Card produto destaque */}
      {featuredBanner && (
        <FeaturedProductCard banner={featuredBanner} />
      )}

      {/* CTA Assinatura — estilo Stitch: card azul escuro */}
      <div className="mx-4 rounded-2xl bg-linear-to-br from-secondary-foreground to-primary p-5 text-white">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-lg font-bold font-heading">Assinatura Xuá</h3>
            <p className="text-sm text-white/70">
              Água automática em sua casa.{"\n"}Economize até 15%.
            </p>
          </div>
          <Link
            href="/subscription/manage"
            className="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-white px-4 text-sm font-bold text-primary transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            Saiba Mais
          </Link>
        </div>
      </div>
    </div>
  );
}
