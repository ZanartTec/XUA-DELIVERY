import { getPrisma } from "../../../infra/prisma/client.js";
import type { BannerType } from "@prisma/client";

const BANNER_SELECT = {
  id: true,
  type: true,
  title: true,
  subtitle: true,
  tag: true,
  highlight: true,
  cta_text: true,
  cta_url: true,
  bg_color: true,
  bg_gradient_from: true,
  bg_gradient_to: true,
  bg_image_url: true,
  text_color: true,
  image_url: true,
  is_active: true,
  sort_order: true,
  created_at: true,
  updated_at: true,
} as const;

export const bannersRepository = {
  async findActive(type?: BannerType) {
    const prisma = getPrisma();
    return prisma.banner.findMany({
      where: { is_active: true, ...(type ? { type } : {}) },
      select: BANNER_SELECT,
      orderBy: { sort_order: "asc" },
    });
  },

  async findAll() {
    const prisma = getPrisma();
    return prisma.banner.findMany({
      select: BANNER_SELECT,
      orderBy: [{ type: "asc" }, { sort_order: "asc" }],
    });
  },

  async findById(id: string) {
    const prisma = getPrisma();
    return prisma.banner.findUnique({ where: { id }, select: BANNER_SELECT });
  },

  async create(data: {
    type: BannerType;
    title: string;
    subtitle?: string | null;
    tag?: string | null;
    highlight?: string | null;
    cta_text?: string | null;
    cta_url?: string | null;
    bg_color?: string | null;
    bg_gradient_from?: string | null;
    bg_gradient_to?: string | null;
    bg_image_url?: string | null;
    text_color?: string | null;
    image_url?: string | null;
    is_active?: boolean;
    sort_order?: number;
  }) {
    const prisma = getPrisma();
    return prisma.banner.create({ data, select: BANNER_SELECT });
  },

  async update(
    id: string,
    data: {
      type?: BannerType;
      title?: string;
      subtitle?: string | null;
      tag?: string | null;
      highlight?: string | null;
      cta_text?: string | null;
      cta_url?: string | null;
      bg_color?: string | null;
      bg_gradient_from?: string | null;
      bg_gradient_to?: string | null;
      bg_image_url?: string | null;
      text_color?: string | null;
      image_url?: string | null;
      is_active?: boolean;
      sort_order?: number;
    }
  ) {
    const prisma = getPrisma();
    return prisma.banner.update({ where: { id }, data, select: BANNER_SELECT });
  },

  async remove(id: string) {
    const prisma = getPrisma();
    return prisma.banner.delete({ where: { id } });
  },
};
