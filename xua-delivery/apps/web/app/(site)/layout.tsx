import { Bricolage_Grotesque, Figtree } from "next/font/google";
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

/** Layout das páginas públicas da marca (site institucional e /links). */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className={`xs ${display.variable} ${body.variable}`}>{children}</div>;
}
