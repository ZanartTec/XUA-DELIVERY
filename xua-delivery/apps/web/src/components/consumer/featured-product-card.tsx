"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

export interface FeaturedBanner {
  id: string;
  tag: string | null;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  cta_text: string | null;
  cta_url: string | null;
  bg_color: string | null;
  text_color: string | null;
}

interface FeaturedProductCardProps {
  banner?: FeaturedBanner;
  /** Fallback props for backwards compatibility */
  name?: string;
  description?: string;
  imageUrl?: string | null;
  href?: string;
}

export function FeaturedProductCard({
  banner,
  name,
  description,
  imageUrl,
  href = "/catalog",
}: FeaturedProductCardProps) {
  const title = banner?.title ?? name ?? "";
  const subtitle = banner?.subtitle ?? description ?? "";
  const image = banner?.image_url ?? imageUrl;
  const ctaText = banner?.cta_text ?? "Conferir agora";
  const ctaUrl = banner?.cta_url ?? href;
  const tag = banner?.tag ?? "Novo";
  const bgColor = banner?.bg_color ?? "#f3f4f5";
  const textColor = banner?.text_color ?? "#191c1d";

  return (
    <div className="mx-4 overflow-hidden rounded-2xl" style={{ backgroundColor: bgColor }}>
      <div className="flex items-center gap-4 p-5">
        <div className="flex-1 space-y-2">
          <span className="inline-block rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            {tag}
          </span>
          <h3
            className="text-lg font-bold font-heading leading-tight"
            style={{ color: textColor }}
          >
            {title}
          </h3>
          <p className="text-sm text-[#434656]">{subtitle}</p>
          <Link
            href={ctaUrl}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            {ctaText}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {image && (
          <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt={title}
              className="h-full w-full object-cover"
            />
          </div>
        )}
      </div>
    </div>
  );
}
