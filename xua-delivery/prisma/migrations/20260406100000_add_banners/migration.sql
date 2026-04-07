-- CreateEnum: banner_type
CREATE TYPE "banner_type" AS ENUM ('carousel', 'featured');

-- CreateTable: 19_cfg_banners
CREATE TABLE "19_cfg_banners" (
    "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
    "type"             "banner_type" NOT NULL,
    "title"            TEXT         NOT NULL,
    "subtitle"         TEXT,
    "tag"              TEXT,
    "highlight"        TEXT,
    "cta_text"         TEXT,
    "cta_url"          TEXT,
    "bg_color"         TEXT,
    "bg_gradient_from" TEXT,
    "bg_gradient_to"   TEXT,
    "bg_image_url"     TEXT,
    "text_color"       TEXT,
    "image_url"        TEXT,
    "is_active"        BOOLEAN      NOT NULL DEFAULT true,
    "sort_order"       INTEGER      NOT NULL DEFAULT 0,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "19_cfg_banners_pkey" PRIMARY KEY ("id")
);
