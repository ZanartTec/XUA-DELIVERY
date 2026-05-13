const MISSING_LOCAL_PRODUCT_IMAGES = new Set(["/images/galao-20l.jpg"]);

export function getRenderableProductImageUrl(imageUrl?: string | null) {
  if (!imageUrl) return null;
  if (MISSING_LOCAL_PRODUCT_IMAGES.has(imageUrl)) return null;
  return imageUrl;
}
