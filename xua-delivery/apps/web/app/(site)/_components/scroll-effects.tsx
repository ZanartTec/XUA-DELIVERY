"use client";

import { useEffect } from "react";

export type MotionMode = "full" | "reduced" | "lite";

type NavigatorPerf = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

/**
 * Decide o nível de animação da página, uma vez por carregamento:
 * - reduced → o sistema pede menos movimento: entradas viram fades curtos, sem loops;
 * - lite    → economia de dados ou aparelho fraco: entradas completas, sem loops caros;
 * - full    → tudo.
 * `?motion=full|reduced|lite` força um modo (útil para testar e demonstrar).
 */
export function detectMotion(): MotionMode {
  const forced = new URLSearchParams(window.location.search).get("motion");
  if (forced === "full" || forced === "reduced" || forced === "lite") return forced;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "reduced";
  const nav = navigator as NavigatorPerf;
  const weak =
    nav.connection?.saveData === true ||
    (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) ||
    (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 2);
  return weak ? "lite" : "full";
}

/** Modo atual, já aplicado em <html data-motion>. */
export function currentMotion(): MotionMode {
  const m = document.documentElement.dataset.motion;
  return m === "reduced" || m === "lite" ? m : "full";
}

/**
 * Efeitos de rolagem da página institucional, sem dependências:
 * - [data-reveal] → recebe .is-in ao entrar na tela (o CSS faz a transição);
 * - [data-play]   → as animações CSS do elemento ficam paradas até ele aparecer;
 * - [data-count]  → anima o número de 0 até o valor ao aparecer;
 * - [data-live]   → recebe .is-off fora da tela, pausando loops (bateria e CPU).
 * Parallax e efeitos presos à rolagem são CSS puro (animation-timeline).
 */
export function ScrollEffects() {
  useEffect(() => {
    const root = document.documentElement;
    const motion = detectMotion();
    root.dataset.motion = motion;
    root.classList.add("xs-js");

    const fmt = new Intl.NumberFormat("pt-BR");
    const runCount = (el: HTMLElement) => {
      const target = Number(el.dataset.count);
      if (!Number.isFinite(target)) return;
      if (motion === "reduced") {
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
    document
      .querySelectorAll<HTMLElement>("[data-reveal],[data-count],[data-play]")
      .forEach((el) => io.observe(el));

    // Pausa as animações contínuas de blocos que saíram da tela.
    const live = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.target.classList.toggle("is-off", !e.isIntersecting);
      },
      { rootMargin: "120px 0px" },
    );
    document.querySelectorAll<HTMLElement>("[data-live]").forEach((el) => live.observe(el));

    return () => {
      io.disconnect();
      live.disconnect();
      root.classList.remove("xs-js");
    };
  }, []);

  return null;
}
