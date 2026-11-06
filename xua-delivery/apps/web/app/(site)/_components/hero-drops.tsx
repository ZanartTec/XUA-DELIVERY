"use client";

import { useEffect, useRef } from "react";

/** Gotas d'água subindo devagar atrás do galão (canvas, decorativo). */
export function HeroDrops() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0;
    let H = 0;
    let raf = 0;
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
      const d = window.devicePixelRatio || 1;
      W = r.width;
      H = r.height;
      cv.width = W * d;
      cv.height = H * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    size();
    const drops = Array.from({ length: 22 }, () => make());

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

    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      for (const d of drops) {
        if (!reduce) {
          d.y -= d.v;
          d.s += 0.01;
          if (d.y < -30) Object.assign(d, make(H + 30));
        }
        draw(d);
      }
      if (!reduce) raf = requestAnimationFrame(tick);
    };
    tick();

    window.addEventListener("resize", size);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
    };
  }, []);

  return <canvas ref={ref} className="xs-drops" aria-hidden />;
}
