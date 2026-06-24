"use client";

import { useState } from "react";
import { useCartStore } from "@/src/store/cart";
import { toast } from "sonner";
import Link from "next/link";
import { SearchBar } from "@/src/components/consumer/search-bar";
import { PromoBannerCarousel } from "@/src/components/consumer/promo-banner-carousel";
import { CategoryFilter } from "@/src/components/consumer/category-filter";
import { FeaturedProductCard } from "@/src/components/consumer/featured-product-card";
import { CatalogCartSummaryCard } from "@/src/components/consumer/catalog-cart-summary-card";
import { ProductGrid } from "@/src/components/consumer/product-grid";
import { PwaInstallPrompt } from "@/src/components/shared/pwa-install-prompt";
import { useDebounce } from "@/src/hooks/use-debounce";
import { useProducts, type ProductItem } from "@/src/hooks/consumer/use-products";
import { useCategories } from "@/src/hooks/consumer/use-categories";
import { useBanners } from "@/src/hooks/consumer/use-banners";

export default function CatalogPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const debouncedSearch = useDebounce(search, 400);

  const {
    products,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useProducts({ search: debouncedSearch, category });
  const { categories, isLoading: categoriesLoading } = useCategories();
  const { carouselBanners, featuredBanner } = useBanners();

  const addItem = useCartStore((s) => s.addItem);

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
      {/* Card de instalação do PWA — notificação flutuante no topo (prioridade de aquisição) */}
      <PwaInstallPrompt />

      {/* Barra de busca */}
      <div className="mt-3">
        <SearchBar value={search} onChange={setSearch} />
      </div>

      {/* Banner carrossel */}
      <PromoBannerCarousel banners={carouselBanners} />

      {/* Filtros de categoria */}
      <CategoryFilter
        categories={categories}
        selected={category}
        onChange={setCategory}
        loading={categoriesLoading}
      />

      {/* Seção destaques */}
      <div className="px-4">
        <h2 className="text-lg font-bold font-heading text-[#191c1d]">Destaques da Semana</h2>
      </div>

      {isError && (
        <div className="mx-4 rounded-2xl bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Não foi possível carregar o catálogo."}
          </p>
        </div>
      )}

      <ProductGrid
        products={products}
        loading={isLoading}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onAdd={handleAdd}
        onLoadMore={() => fetchNextPage()}
      />

      {/* Card produto destaque */}
      {featuredBanner && <FeaturedProductCard banner={featuredBanner} />}

      {/* Barra flutuante do carrinho — posição fixa acima do nav */}
      <CatalogCartSummaryCard />

      {/* CTA Assinatura — estilo Stitch: card azul escuro */}
      <div className="mx-4 rounded-2xl bg-linear-to-br from-[#1B4A9A] to-[#5697E9] p-5 text-white">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-lg font-bold font-heading">Assinatura Xuá</h3>
            <p className="text-sm text-white/70">
              Água automática em sua casa.{"\n"}Economize até 15%.
            </p>
          </div>
          <Link
            href="/subscription/manage"
            className="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-[#00E0FF] px-4 text-sm font-bold text-[#001735] transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            Saiba Mais
          </Link>
        </div>
      </div>
    </div>
  );
}
