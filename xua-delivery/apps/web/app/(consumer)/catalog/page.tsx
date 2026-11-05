"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useCartStore } from "@/src/store/cart";
import { Button } from "@/src/components/ui/button";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { SearchBar } from "@/src/components/consumer/search-bar";
import { PromoBannerCarousel } from "@/src/components/consumer/promo-banner-carousel";
import { ALL_CATEGORY, CategoryFilter } from "@/src/components/consumer/category-filter";
import { FeaturedProductCard } from "@/src/components/consumer/featured-product-card";
import { CatalogCartSummaryCard } from "@/src/components/consumer/catalog-cart-summary-card";
import { ProductGrid } from "@/src/components/consumer/product-grid";
import { PwaInstallPrompt } from "@/src/components/shared/pwa-install-prompt";
import { useDebounce } from "@/src/hooks/use-debounce";
import { useIsClient } from "@/src/hooks/use-is-client";
import { useProducts, type ProductItem } from "@/src/hooks/consumer/use-products";
import { useCategories } from "@/src/hooks/consumer/use-categories";
import { useBanners } from "@/src/hooks/consumer/use-banners";
import { useHasActivePlans } from "@/src/hooks/consumer/use-subscription-plans";

export default function CatalogPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORY.value);
  const debouncedSearch = useDebounce(search, 400);

  const { products, isLoading, isError, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useProducts({
    search: debouncedSearch,
    category,
  });
  const { categories, isLoading: categoriesLoading } = useCategories();
  const { carouselBanners, featuredBanner } = useBanners();
  const { hasPlans } = useHasActivePlans();

  const mounted = useIsClient();
  const cartItems = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const updateQty = useCartStore((s) => s.updateQty);
  const quantityOf = (productId: string) =>
    mounted ? (cartItems.find((i) => i.product_id === productId)?.quantity ?? 0) : 0;

  function handleAdd(product: ProductItem) {
    addItem({
      product_id: product.id,
      product_name: product.name,
      unit_price_cents: product.price_cents,
      image_url: product.image_url,
      bottle_product_id: product.requires_empty_return ? product.bottle_product_id : null,
      bottle_charge_cents: product.requires_empty_return ? (product.bottle_product?.price_cents ?? null) : null,
    });
  }

  const filtering = debouncedSearch.trim().length > 0 || category !== ALL_CATEGORY.value;
  const categoryLabel = categories.find((c) => c.value === category)?.label;
  const sectionTitle = debouncedSearch.trim()
    ? `Resultados para “${debouncedSearch.trim()}”`
    : categoryLabel ?? "Destaques da semana";

  function clearFilters() {
    setSearch("");
    setCategory(ALL_CATEGORY.value);
  }

  return (
    <div className="mx-auto w-full max-w-5xl pb-4">
      <PwaInstallPrompt />

      {/* Topo: busca + categorias, grudados sob o header */}
      <div className="sticky top-(--app-header-h) z-30 space-y-3 bg-background/95 px-4 pt-3 pb-2 backdrop-blur supports-backdrop-filter:bg-background/85">
        <SearchBar value={search} onChange={setSearch} />
        <CategoryFilter categories={categories} selected={category} onChange={setCategory} loading={categoriesLoading} />
      </div>

      <div className="space-y-5 pt-2">
        {!filtering ? <PromoBannerCarousel banners={carouselBanners} /> : null}

        <div className="flex items-baseline justify-between gap-2 px-4">
          <h2 className="font-heading text-lg font-bold text-ink">{sectionTitle}</h2>
          {filtering ? (
            <Button variant="link" size="sm" className="px-0" onClick={clearFilters}>
              Limpar filtros
            </Button>
          ) : null}
        </div>

        {isError ? (
          <Alert variant="destructive" className="mx-4 w-auto">
            <AlertDescription>
              {error instanceof Error ? error.message : "Não foi possível carregar o catálogo."}
            </AlertDescription>
          </Alert>
        ) : null}

        <ProductGrid
          products={products}
          loading={isLoading}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          quantityOf={quantityOf}
          onAdd={handleAdd}
          onChangeQuantity={(product, q) => updateQty(product.id, q)}
          onLoadMore={() => fetchNextPage()}
          emptyAction={
            filtering ? (
              <Button variant="outline" onClick={clearFilters}>
                Ver todos os produtos
              </Button>
            ) : null
          }
        />

        {!filtering && featuredBanner ? <FeaturedProductCard banner={featuredBanner} /> : null}

        {/* Só promove assinatura quando existe plano para assinar. */}
        {!filtering && hasPlans ? (
          <div className="mx-4 flex items-center justify-between gap-4 rounded-2xl bg-linear-to-br from-primary to-sky p-5 text-primary-foreground">
            <div className="space-y-1">
              <h3 className="flex items-center gap-2 font-heading text-lg font-bold">
                <CalendarDays className="size-5" aria-hidden />
                Assinatura Xuá
              </h3>
              <p className="text-sm text-primary-foreground/80">Água em casa no dia certo, sem precisar lembrar.</p>
            </div>
            <Button asChild variant="cta" size="lg" className="shrink-0">
              <Link href="/subscription/create">Conhecer</Link>
            </Button>
          </div>
        ) : null}
      </div>

      <CatalogCartSummaryCard />
    </div>
  );
}
