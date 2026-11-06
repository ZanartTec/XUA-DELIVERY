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
    document.querySelectorAll<HTMLElement>("[data-reveal],[data-count]").forEach((el) => io.observe(el));

    // Palcos animados só começam com boa parte à vista, para a entrada ser vista.
    const stage = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          stage.unobserve(e.target);
        }
      },
      { threshold: 0.35 },
    );
    document.querySelectorAll<HTMLElement>("[data-play]").forEach((el) => stage.observe(el));

    // Pausa as animações contínuas de blocos que saíram da tela.
    const live = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.target.classList.toggle("is-off", !e.isIntersecting);
      },
      { rootMargin: "120px 0px" },
    );
    document.querySelectorAll<HTMLElement>("[data-live]").forEach((el) => live.observe(el));

    // [data-tilt]: inclinação 3D que segue o mouse (só desktop com mouse de verdade).
    const tiltOff: Array<() => void> = [];
    if (motion !== "reduced" && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      document.querySelectorAll<HTMLElement>("[data-tilt]").forEach((el) => {
        let raf = 0;
        const move = (e: PointerEvent) => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            const r = el.getBoundingClientRect();
            const x = (e.clientX - r.left) / r.width - 0.5;
            const y = (e.clientY - r.top) / r.height - 0.5;
            el.style.setProperty("--ry", `${(x * 10).toFixed(2)}deg`);
            el.style.setProperty("--rx", `${(-y * 8).toFixed(2)}deg`);
          });
        };
        const leave = () => {
          cancelAnimationFrame(raf);
          el.style.removeProperty("--rx");
          el.style.removeProperty("--ry");
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerleave", leave);
        tiltOff.push(() => {
          leave();
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerleave", leave);
        });
      });

      // [data-glow]: um brilho suave segue o cursor (move um elemento com transform).
      document.querySelectorAll<HTMLElement>("[data-glow]").forEach((el) => {
        let raf = 0;
        const move = (e: PointerEvent) => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            const r = el.getBoundingClientRect();
            el.style.setProperty("--gx", `${Math.round(e.clientX - r.left)}px`);
            el.style.setProperty("--gy", `${Math.round(e.clientY - r.top)}px`);
            el.classList.add("is-glow");
          });
        };
        const leave = () => {
          cancelAnimationFrame(raf);
          el.classList.remove("is-glow");
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerleave", leave);
        tiltOff.push(() => {
          leave();
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerleave", leave);
        });
      });
    }

    return () => {
      tiltOff.forEach((off) => off());
      io.disconnect();
      stage.disconnect();
      live.disconnect();
      root.classList.remove("xs-js");
    };
  }, []);

  return null;
}
