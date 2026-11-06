"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CloseIcon, MenuIcon } from "./icons";

const NAV = [
  { href: "#agua", id: "agua", label: "A água" },
  { href: "#consciente", id: "consciente", label: "Hidratação" },
  { href: "#qualidade", id: "qualidade", label: "Qualidade" },
  { href: "#historia", id: "historia", label: "História" },
  { href: "#socioambiental", id: "socioambiental", label: "Socioambiental" },
  { href: "#distribuidor", id: "distribuidor", label: "Seja distribuidor" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 12);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, y / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const sections = NAV.map((n) => document.getElementById(n.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={`xs-top${scrolled ? " is-scrolled" : ""}${open ? " is-open" : ""}`}>
      <div className="xs-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden />
      <div className="xs-wrap xs-top-in">
        <a className="xs-brand" href="#inicio" aria-label="Água Mineral Xuá, início">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/site/logo.svg" alt="" width={52} height={52} />
          <span>
            Água Mineral Xuá<small>Juiz de Fora · MG</small>
          </span>
        </a>

        <nav id="xs-nav" className="xs-nav" aria-label="Navegação principal">
          {NAV.map((n, i) => (
            <a
              key={n.id}
              href={n.href}
              className={active === n.id ? "is-active" : undefined}
              style={{ "--i": i } as React.CSSProperties}
              onClick={() => setOpen(false)}
            >
              {n.label}
            </a>
          ))}
          <Link className="xs-btn xs-btn-primary xs-nav-cta" href="/register" prefetch={false} onClick={() => setOpen(false)}>
            Peça sua água
          </Link>
        </nav>

        <button
          type="button"
          className="xs-menu-btn"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          aria-controls="xs-nav"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>
    </header>
  );
}
