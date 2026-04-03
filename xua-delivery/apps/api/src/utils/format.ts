export function formatZipCode(zipCode: string): string {
  const clean = zipCode.replace(/\D/g, "");
  return clean.length === 8 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
}
