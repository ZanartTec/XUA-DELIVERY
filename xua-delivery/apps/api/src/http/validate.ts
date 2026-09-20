import type { ZodType } from "zod";
import { badRequest } from "../errors/index.js";

/**
 * Valida a entrada contra um schema do @xua/shared ou lança 400.
 *
 * Substitui o bloco `if (!parsed.success) { res.status(400).json({ error:
 * parsed.error.issues[0].message }); return; }` que estava copiado em quase
 * todos os handlers — a mensagem devolvida é a mesma, só que agora formatada
 * num lugar só (errorHandler) e com um `code` consistente.
 */
export function parseOrThrow<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? "Dados inválidos", {
      details: result.error.issues,
    });
  }
  return result.data;
}
