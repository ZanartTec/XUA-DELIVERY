import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Aliases compartilhados pelas configs de unit e integração.
 *
 * Os testes moraram dentro de `src/` até serem centralizados aqui; com a
 * separação, caminho relativo viraria `../../../../../apps/api/src/...` e
 * quebraria a cada arquivo movido. Estes aliases mantêm o import estável e
 * legível, e precisam espelhar os `paths` do tsconfig.
 */
export const ALIASES = {
  "@api": path.resolve(root, "apps/api/src"),
  "@xua/shared": path.resolve(root, "packages/shared/src"),
  "@tests": path.resolve(root, "tests"),
} as const;
