"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";

export interface ProductItem {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_cents: number;
  deposit_cents: number;
  kind: "WATER" | "BOTTLE" | "OTHER";
  bottle_product_id: string | null;
  is_active: boolean;
  categories: { id: string; name: string; value: string }[];
}

interface ProductsPage {
  products: ProductItem[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

interface UseProductsParams {
  search?: string;
  category?: string;
}

const PAGE_LIMIT = 24;

export function useProducts({ search, category }: UseProductsParams) {
  const query = useInfiniteQuery({
    queryKey: ["products", { search, category }],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ page: String(pageParam), limit: String(PAGE_LIMIT) });
      if (search) params.set("search", search);
      if (category && category !== "all") params.set("category", category);
      return api.get<ProductsPage>(`/api/products?${params.toString()}`);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
  });

  const products = query.data?.pages.flatMap((p) => p.products) ?? [];

  return {
    products,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}
