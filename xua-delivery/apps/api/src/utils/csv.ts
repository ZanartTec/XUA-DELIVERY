/**
 * Utilitários para geração de arquivos CSV.
 * Lida com escape de campos que contêm vírgulas, aspas ou quebras de linha.
 */

/**
 * Escapa um campo CSV individualmente conforme RFC 4180.
 */
function escapeField(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serializa uma linha de campos em formato CSV.
 */
export function csvRow(fields: unknown[]): string {
  return fields.map(escapeField).join(",");
}

/**
 * Gera o conteúdo completo de um arquivo CSV a partir de cabeçalhos
 * e linhas de dados.
 *
 * @param headers - Array de nomes das colunas
 * @param rows - Array de arrays com os valores de cada linha
 * @returns String CSV pronta para envio como `text/csv`
 */
export function buildCsv(headers: string[], rows: unknown[][]): string {
  const header = csvRow(headers);
  const body = rows.map(csvRow).join("\n");
  return body.length > 0 ? `${header}\n${body}` : header;
}
