import type { MetadataRoute } from "next";
import { SITE_URL } from "./(site)/_lib/site-url";

/** Robôs indexam o site e os links; as áreas internas do app ficam de fora. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/app",
          "/catalog",
          "/cart",
          "/checkout",
          "/orders",
          "/subscription",
          "/profile",
          "/distributor",
          "/driver",
          "/ops",
          "/support",
          "/forgot-password",
          "/reset-password",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
