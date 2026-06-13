function splitOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getPrimaryAppOrigin(): string {
  return splitOrigins(process.env.APP_ORIGIN)[0] ?? "http://localhost:3000";
}

export function getAllowedAppOrigins(): string | string[] {
  const origins = [
    ...splitOrigins(process.env.APP_ORIGIN),
    ...splitOrigins(process.env.APP_ALLOWED_ORIGINS),
  ];

  const uniqueOrigins = [...new Set(origins)];
  if (uniqueOrigins.length === 0) return "http://localhost:3000";
  if (uniqueOrigins.length === 1) return uniqueOrigins[0] as string;
  return uniqueOrigins;
}