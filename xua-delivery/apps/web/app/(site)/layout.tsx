import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { SITE_URL } from "./_lib/site-url";
import "./site.css";

const display = Bricolage_Grotesque({
  variable: "--xs-display",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

const body = Figtree({
  variable: "--xs-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  // Endereço público: resolve canonical e imagens de compartilhamento em URLs absolutas.
  metadataBase: new URL(SITE_URL),
  title: "Água Mineral Xuá",
  applicationName: "Água Mineral Xuá",
  twitter: { card: "summary_large_image" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

/**
 * Layout raiz das páginas públicas da marca (site institucional e /links).
 * É separado do layout do app (app/(app)/layout.tsx) para o site não carregar
 * providers, service worker, Tailwind e fontes que só o app usa.
 * Navegar entre os dois faz um carregamento completo de página.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body className="xs-body">
        <div className="xs">{children}</div>
      </body>
    </html>
  );
}
