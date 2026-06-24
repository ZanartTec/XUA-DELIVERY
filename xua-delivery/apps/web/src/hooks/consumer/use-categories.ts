"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";

export interface CategoryItem {
  label: string;
  value: string;
}

interface CategoriesResponse {
  categories: { id: string; name: string; value: string }[];
}

export function useCategories() {
  const query = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<CategoriesResponse>("/api/categories"),
  });

  const categories: CategoryItem[] =
    query.data?.categories.map((c) => ({ label: c.name, value: c.value })) ?? [];

  return { categories, isLoading: query.isLoading };
}
