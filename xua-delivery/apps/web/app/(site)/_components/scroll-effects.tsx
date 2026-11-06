"use client";

import { useEffect } from "react";

/**
 * Efeitos de rolagem da página institucional, sem dependências:
 * - [data-reveal]  → recebe .is-in ao entrar na tela (o CSS faz a transição);
 * - [data-count]   → anima o número de 0 até o valor ao aparecer;
 * - [data-parallax]→ desloca levemente no eixo Y conforme a rolagem.
 */
export function ScrollEffects() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    root.classList.add("xs-js");

    const fmt = new Intl.NumberFormat("pt-BR");
    const runCount = (el: HTMLElement) => {
      const target = Number(el.dataset.count);
      if (!Number.isFinite(target)) return;
      if (reduce) {
        el.textContent = fmt.format(target);
        return;
      }
      const dur = 1400;
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt.format(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.classList.add("is-in");
          if (el.dataset.count !== undefined) runCount(el);
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    document.querySelectorAll<HTMLElement>("[data-reveal],[data-count]").forEach((el) => io.observe(el));

    let raf = 0;
    const parallax = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const vh = window.innerHeight;
        for (const el of parallax) {
          const r = el.getBoundingClientRect();
          if (r.bottom < -200 || r.top > vh + 200) continue;
          const speed = Number(el.dataset.parallax) || 0.1;
          const offset = (r.top + r.height / 2 - vh / 2) * -speed;
          el.style.setProperty("--py", `${offset.toFixed(1)}px`);
        }
      });
    };
    if (!reduce && parallax.length) {
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
      root.classList.remove("xs-js");
    };
  }, []);

  return null;
}
