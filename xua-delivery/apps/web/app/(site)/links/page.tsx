import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowIcon,
  GlobeIcon,
  InstagramIcon,
  PhoneIcon,
  SmartphoneIcon,
  TruckIcon,
  WhatsAppIcon,
} from "../_components/icons";
import { isAppRoute, PUBLIC_LINKS, type LinkIcon, type PublicLink } from "../_lib/site-config";
import { DripDrop } from "../_components/drip-drop";
import { ScrollEffects } from "../_components/scroll-effects";
import { ShareButton } from "./share-button";

export const metadata: Metadata = {
  title: "Água Mineral Xuá · Links",
  description: "Peça sua água, conheça a Xuá, seja um distribuidor e fale com a gente.",
  alternates: { canonical: "/links" },
  openGraph: {
    title: "Água Mineral Xuá",
    description: "Todo mundo pede, todo mundo bebe. Todos os nossos links em um só lugar.",
    url: "/links",
    siteName: "Água Mineral Xuá",
    locale: "pt_BR",
    type: "website",
  },
};

const ICONS: Record<LinkIcon, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  site: GlobeIcon,
  app: SmartphoneIcon,
  whatsapp: WhatsAppIcon,
  phone: PhoneIcon,
  instagram: InstagramIcon,
  truck: WhatsAppIcon,
};

const ICON_CLASS: Partial<Record<LinkIcon, string>> = {
  whatsapp: "is-whatsapp",
  truck: "is-whatsapp",
  instagram: "is-instagram",
};

// Gotas decorativas subindo ao fundo (posições fixas para não variar entre servidor e cliente).
const BUBBLES = [
  { x: "6%", s: "18px", t: "16s", dl: "-2s" },
  { x: "18%", s: "34px", t: "22s", dl: "-9s" },
  { x: "31%", s: "14px", t: "14s", dl: "-5s" },
  { x: "47%", s: "26px", t: "19s", dl: "-12s" },
  { x: "62%", s: "16px", t: "15s", dl: "-1s" },
  { x: "74%", s: "40px", t: "26s", dl: "-15s" },
  { x: "86%", s: "20px", t: "18s", dl: "-7s" },
  { x: "94%", s: "12px", t: "13s", dl: "-4s" },
];

function LinkItem({ link }: { link: PublicLink }) {
  const Icon = ICONS[link.icon] ?? TruckIcon;
  const cls = `xl-link${link.featured ? " is-featured" : ""}`;
  const content = (
    <>
      <span className={`xl-ico ${link.featured ? "" : (ICON_CLASS[link.icon] ?? "")}`}>
        {link.featured ? <DripDrop /> : <Icon />}
      </span>
      <span className="xl-txt">
        <b>{link.label}</b>
        {link.sub && <small>{link.sub}</small>}
      </span>
      <ArrowIcon className="xl-arrow" />
    </>
  );

  if (link.href.startsWith("/")) {
    return (
      <Link className={cls} href={link.href} prefetch={isAppRoute(link.href) ? false : undefined}>
        {content}
      </Link>
    );
  }
  return (
    <a
      className={cls}
      href={link.href}
      {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {content}
    </a>
  );
}

export default function LinksPage() {
  return (
    <main className="xl">
      <ScrollEffects />
      <div className="xl-bg" aria-hidden>
        {BUBBLES.map((b) => (
          <span
            key={b.x}
            className="xl-bubble"
            style={{ "--x": b.x, "--s": b.s, "--t": b.t, "--dl": b.dl } as React.CSSProperties}
          />
        ))}
        <div className="xl-waves">
          {[
            { cls: "", fill: "rgba(156,207,239,0.10)" },
            { cls: "is-b", fill: "rgba(166,206,57,0.10)" },
          ].map((w) => (
            <svg key={w.cls || "a"} className={w.cls} viewBox="0 0 2880 160" preserveAspectRatio="none">
              <path
                fill={w.fill}
                d="M0 80c240-50 480-50 720 0s480 50 720 0 480-50 720 0 480 50 720 0v80H0z"
              />
            </svg>
          ))}
        </div>
      </div>

      <div className="xl-card">
        <div className="xl-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/site/logo.svg" alt="Água Mineral Xuá" />
        </div>
        <h1>Água Mineral Xuá</h1>
        <p className="xl-tag">
          A pureza que te move em <em>cada gota.</em>
        </p>

        <ul className="xl-list">
          {PUBLIC_LINKS.map((link, i) => (
            <li key={link.label} style={{ "--i": i } as React.CSSProperties}>
              <LinkItem link={link} />
            </li>
          ))}
        </ul>

        <ShareButton />

        <p className="xl-foot">Fonte Estância São Luiz · Juiz de Fora, MG</p>
      </div>
    </main>
  );
}
