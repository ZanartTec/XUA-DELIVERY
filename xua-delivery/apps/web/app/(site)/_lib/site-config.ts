/**
 * Dados de contato e links públicos da Água Mineral Xuá.
 * Fonte única para o site institucional (/) e para a página de links (/links):
 * trocar um número ou incluir um link novo é só editar este arquivo.
 */

export const CONTACT = {
  /** WhatsApp do comercial (distribuidores e revendedores), só dígitos com DDI. */
  whatsappDistribuidor: "5532984164334",
  whatsappDistribuidorLabel: "(32) 98416-4334",
  /** Telefone fixo da fonte (consumidor final). */
  phoneFonte: "+553231421031",
  phoneFonteLabel: "(32) 3142-1031",
  instagramHandle: "@aguamineralxua",
  instagramUrl: "https://www.instagram.com/aguamineralxua/",
  /** Rotas do app de pedidos (este mesmo projeto). */
  appRegister: "/register",
  appLogin: "/login",
} as const;

export function whatsappUrl(message?: string): string {
  const base = `https://wa.me/${CONTACT.whatsappDistribuidor}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export const DISTRIBUIDOR_MSG = "Olá! Tenho interesse em ser distribuidor da Água Mineral Xuá.";

export type LinkIcon = "site" | "app" | "whatsapp" | "phone" | "instagram" | "truck";

export interface PublicLink {
  label: string;
  sub?: string;
  href: string;
  icon: LinkIcon;
  /** Destaque visual (primeiro botão, chamada principal). */
  featured?: boolean;
  external?: boolean;
}

/** Botões da página /links, na ordem em que aparecem. */
export const PUBLIC_LINKS: PublicLink[] = [
  {
    label: "Peça sua água pelo app",
    sub: "Receba o galão Xuá em casa",
    href: CONTACT.appRegister,
    icon: "app",
    featured: true,
  },
  {
    label: "Conheça a Xuá",
    sub: "Nosso site",
    href: "/institucional",
    icon: "site",
  },
  {
    label: "Seja um distribuidor",
    sub: `WhatsApp ${CONTACT.whatsappDistribuidorLabel}`,
    href: whatsappUrl(DISTRIBUIDOR_MSG),
    icon: "truck",
    external: true,
  },
  {
    label: "Ligue para a fonte",
    sub: `${CONTACT.phoneFonteLabel} · indicamos o distribuidor do seu bairro`,
    href: `tel:${CONTACT.phoneFonte}`,
    icon: "phone",
  },
  {
    label: "Instagram",
    sub: CONTACT.instagramHandle,
    href: CONTACT.instagramUrl,
    icon: "instagram",
    external: true,
  },
];

/**
 * Rotas do app (outro layout raiz): a navegação até elas recarrega a página inteira,
 * então o prefetch do Next só baixaria CSS e fontes do app à toa.
 */
export function isAppRoute(href: string): boolean {
  return ["/register", "/login", "/app"].some((p) => href === p || href.startsWith(`${p}/`) || href.startsWith(`${p}?`));
}
