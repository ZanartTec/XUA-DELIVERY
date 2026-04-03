/**
 * Extrai e normaliza parâmetros de paginação por offset (limit/offset)
 * a partir dos query params de uma Request.
 */
export function parseLimitOffset(
  query: Record<string, unknown>,
  defaults: { limit?: number; maxLimit?: number } = {}
): { limit: number; offset: number } {
  const max = defaults.maxLimit ?? 100;
  const defaultLimit = defaults.limit ?? 50;

  const limit = Math.min(
    Math.max(parseInt(query.limit as string) || defaultLimit, 1),
    max
  );
  const offset = Math.max(parseInt(query.offset as string) || 0, 0);

  return { limit, offset };
}

/**
 * Extrai e normaliza parâmetros de paginação por página (page/pageSize).
 */
export function parsePage(
  query: Record<string, unknown>,
  defaults: { pageSize?: number; maxPageSize?: number } = {}
): { page: number; pageSize: number; skip: number } {
  const max = defaults.maxPageSize ?? 100;
  const defaultSize = defaults.pageSize ?? 20;

  const page = Math.max(parseInt(query.page as string) || 1, 1);
  const pageSize = Math.min(
    Math.max(parseInt(query.pageSize as string) || defaultSize, 1),
    max
  );

  return { page, pageSize, skip: (page - 1) * pageSize };
}
