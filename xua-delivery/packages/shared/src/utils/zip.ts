/**
 * Normalização de CEP — fonte única da verdade do formato persistido.
 *
 * O banco grava CEP no formato "#####-###" (ver prisma/seed.ts e
 * prisma/production/seed_distributor_sao_luiz_jf.sql), e o cadastro de endereço
 * do consumidor procura cobertura por esse mesmo formato. Qualquer entrada de
 * CEP em zone coverage PRECISA passar por aqui, senão a cobertura criada nunca
 * casa com um endereço real.
 */

/** "36010000" | "36010-000" | " 36010 000 " -> "36010-000"; inválido -> null */
export function normalizeZipCode(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/**
 * Normaliza nome de bairro para COMPARAÇÃO (sem acento, sem caixa, sem espaço
 * duplo). O valor original é o que fica gravado — isto serve só para deduplicar
 * listas coladas e para casar entradas equivalentes antes de ir ao banco.
 */
export function normalizeNeighborhood(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
