/** Formatadores de texto usados nas telas (pt-BR). */

/** Escolhe singular/plural: plural(2, "garrafão", "garrafões") → "2 garrafões". */
export function plural(count: number, singular: string, pluralForm: string, withCount = true): string {
  const word = count === 1 ? singular : pluralForm;
  return withCount ? `${count} ${word}` : word;
}

/** Só dígitos. */
export function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** (11) 98765-4321 / (11) 3456-7890 — tolera entrada parcial (para máscara). */
export function formatPhone(value: string | null | undefined): string {
  const d = onlyDigits(value).replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** 01234-567 — tolera entrada parcial. */
export function formatCep(value: string | null | undefined): string {
  const d = onlyDigits(value).slice(0, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Link tel: com DDI do Brasil. */
export function phoneHref(value: string | null | undefined): string | null {
  const d = onlyDigits(value);
  if (d.length < 10) return null;
  return `tel:+${d.startsWith("55") && d.length > 11 ? d : `55${d}`}`;
}

/** Link do WhatsApp (wa.me) com DDI do Brasil. */
export function whatsappHref(value: string | null | undefined): string | null {
  const d = onlyDigits(value);
  if (d.length < 10) return null;
  return `https://wa.me/${d.startsWith("55") && d.length > 11 ? d : `55${d}`}`;
}
