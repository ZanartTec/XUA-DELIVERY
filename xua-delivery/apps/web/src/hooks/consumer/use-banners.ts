"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import type { BannerSlide } from "@/src/components/consumer/promo-banner-carousel";
import type { FeaturedBanner } from "@/src/components/consumer/featured-product-card";

type BannerItem = BannerSlide & { type: "CAROUSEL" | "FEATURED" };

interface BannersResponse {
  banners: BannerItem[];
}

export function useBanners() {
  const query = useQuery({
    queryKey: ["banners"],
    queryFn: () => api.get<BannersResponse>("/api/banners"),
  });

  const carouselBanners = useMemo(
    () => query.data?.banners.filter((b) => b.type === "CAROUSEL") ?? [],
    [query.data]
  );

  const featuredBanner: FeaturedBanner | null = useMemo(
    () => query.data?.banners.find((b) => b.type === "FEATURED") ?? null,
    [query.data]
  );

  return { carouselBanners, featuredBanner };
}
