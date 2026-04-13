"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface BannerSlide {
  id: string;
  tag: string | null;
  title: string;
  subtitle: string | null;
  highlight: string | null;
  bg_color: string | null;
  bg_gradient_from: string | null;
  bg_gradient_to: string | null;
  bg_image_url: string | null;
  text_color: string | null;
  image_url: string | null;
  cta_text: string | null;
  cta_url: string | null;
}

const FALLBACK_SLIDES: BannerSlide[] = [
  {
    id: "fallback-1",
    tag: "OFERTA DE BOAS-VINDAS",
    title: "Primeira compra?\nR$ 10 OFF!",
    subtitle: "Use o cupom:",
    highlight: "XUAFRESH",
    bg_color: null,
    bg_gradient_from: "#1B4A9A",
    bg_gradient_to: "#5697E9",
    bg_image_url: "/images/banner-welcome.webp",
    text_color: null,
    image_url: null,
    cta_text: null,
    cta_url: null,
  },
];

const AUTO_PLAY_MS = 5000;

interface PromoBannerCarouselProps {
  banners?: BannerSlide[];
}

export function PromoBannerCarousel({ banners }: PromoBannerCarouselProps) {
  const slides = banners && banners.length > 0 ? banners : FALLBACK_SLIDES;
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, AUTO_PLAY_MS);
  }, [slides.length]);

  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resetTimer]);

  function goTo(index: number) {
    setCurrent(index);
    resetTimer();
  }

  const slide = slides[current];

  // Build gradient/bg style
  const gradientFrom = slide.bg_gradient_from ?? "#1B4A9A";
  const gradientTo = slide.bg_gradient_to ?? "#5697E9";
  const bgStyle: React.CSSProperties = slide.bg_color
    ? { backgroundColor: slide.bg_color }
    : { backgroundImage: `linear-gradient(to bottom right, ${gradientFrom}, ${gradientTo})` };

  const textColor = slide.text_color ?? "#ffffff";

  return (
    <div className="px-4">
      <div
        className="relative overflow-hidden rounded-2xl p-5 min-h-40"
        style={{ ...bgStyle, color: textColor }}
      >
        {/* Background image */}
        {slide.bg_image_url && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-30"
            style={{ backgroundImage: `url(${slide.bg_image_url})` }}
          />
        )}

        {/* Content over image */}
        <div className="relative z-10">
          {/* Tag */}
          {slide.tag && (
            <span className="mb-2 inline-block rounded-full bg-white/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">
              {slide.tag}
            </span>
          )}

          {/* Title */}
          <h2 className="text-2xl font-bold font-heading leading-tight whitespace-pre-line">
            {slide.title}
          </h2>

          {/* Subtitle */}
          {slide.subtitle && (
            <p className="mt-2 text-sm" style={{ color: `${textColor}cc` }}>
              {slide.subtitle}
              {slide.highlight && (
                <span className="ml-1 font-bold tracking-wide" style={{ color: textColor }}>
                  {slide.highlight}
                </span>
              )}
            </p>
          )}

          {/* CTA button */}
          {slide.cta_text && slide.cta_url && (
            <a
              href={slide.cta_url}
              className="mt-3 inline-flex items-center rounded-lg bg-[#C8F708] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#1a2600] transition-colors hover:bg-[#C8F708]/90"
            >
              {slide.cta_text}
            </a>
          )}

          {/* Dots */}
          {slides.length > 1 && (
            <div className="mt-4 flex gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  aria-label={`Slide ${i + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    i === current ? "w-6 bg-white" : "w-2 bg-white/40"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
