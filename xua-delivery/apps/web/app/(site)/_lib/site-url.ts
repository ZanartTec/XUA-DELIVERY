/**
 * Endereço público do site, usado em canonical, sitemap, robots.txt e nas imagens
 * de compartilhamento (WhatsApp, Instagram, Google).
 *
 * Ordem: NEXT_PUBLIC_SITE_URL (definir com o domínio oficial em produção)
 *      → RENDER_EXTERNAL_URL (preenchida automaticamente pelo Render)
 *      → localhost (desenvolvimento).
 */
function resolveSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3001";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3001";
  }
}

export const SITE_URL = resolveSiteUrl();
