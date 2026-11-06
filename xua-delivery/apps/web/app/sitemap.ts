import type { MetadataRoute } from "next";
import { SITE_URL } from "./(site)/_lib/site-url";

/** Páginas públicas da marca. "/institucional" fica de fora: é a mesma página de "/". */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/links`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];
}
