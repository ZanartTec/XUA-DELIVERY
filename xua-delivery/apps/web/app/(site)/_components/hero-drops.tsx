"use client";

import { useEffect, useRef } from "react";
import { detectMotion } from "./scroll-effects";

/**
 * Gotas d'água subindo devagar atrás do galão (canvas, decorativo).
 * Só desenha enquanto está visível e com a aba ativa; resolução limitada a 2x
 * (telas 3x quadruplicariam o trabalho sem ganho visível em gotas desfocadas).
 */
export function HeroDrops() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const motion = detectMotion();
    if (motion === "lite") return; // aparelho fraco: sem canvas contínuo
    const still = motion === "reduced";

    let W = 0;
    let H = 0;
    let raf = 0;
    let visible = true;
    type Drop = { x: number; y: number; r: number; v: number; a: number; s: number };
    const make = (y?: number): Drop => ({
      x: Math.random() * W,
      y: y ?? H * (0.1 + Math.random() * 0.9),
      r: 3 + Math.random() * 8,
      v: 0.15 + Math.random() * 0.4,
      a: 0.2 + Math.random() * 0.5,
      s: Math.random() * Math.PI * 2,
    });

    const size = () => {
      const r = cv.getBoundingClientRect();
      const d = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width;
      H = r.height;
      cv.width = Math.round(W * d);
      cv.height = Math.round(H * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    size();
    const drops = Array.from({ length: W < 500 ? 14 : 22 }, () => make());

    const draw = (d: Drop) => {
      const r = d.r;
      const x = d.x + Math.sin(d.s) * 6;
      ctx.beginPath();
      ctx.moveTo(x, d.y - r * 1.6);
      ctx.bezierCurveTo(x + r * 0.9, d.y - r * 0.4, x + r, d.y + r * 0.2, x + r, d.y + r * 0.3);
      ctx.arc(x, d.y + r * 0.3, r, 0, Math.PI);
      ctx.bezierCurveTo(x - r, d.y + r * 0.2, x - r * 0.9, d.y - r * 0.4, x, d.y - r * 1.6);
      ctx.fillStyle = `rgba(156,207,239,${d.a})`;
      ctx.fill();
    };

    const frame = () => {
      ctx.clearRect(0, 0, W, H);
      for (const d of drops) {
        if (!still) {
          d.y -= d.v;
          d.s += 0.01;
          if (d.y < -30) Object.assign(d, make(H + 30));
        }
        draw(d);
      }
    };
    const loop = () => {
      frame();
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (still || raf || !visible || document.hidden) return;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    frame();
    start();

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(cv);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    const onResize = () => {
      size();
      frame();
    };
    window.addEventListener("resize", onResize);

    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} className="xs-drops" aria-hidden />;
}
