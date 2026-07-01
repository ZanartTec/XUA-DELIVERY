import redis, { ensureConnected } from "../redis/client";

const PWD_CHANGED_PREFIX = "pwd:changed:";

// TTL = vida máxima de um JWT (24h). Depois disso nenhum token antigo existe,
// então a marca pode expirar sem risco. Mesmo padrão do blacklist por-jti.
const TTL_SECONDS = 60 * 60 * 24;

/**
 * Registra que a senha do usuário mudou em `atMs` (epoch ms). Qualquer JWT
 * emitido antes desse instante passa a ser considerado inválido.
 */
export async function markPasswordChanged(
  userId: string,
  atMs: number = Date.now()
): Promise<void> {
  await ensureConnected();
  await redis.set(`${PWD_CHANGED_PREFIX}${userId}`, String(atMs), "EX", TTL_SECONDS);
}

/**
 * Retorna true se o token (emitido em `iatSeconds`) é anterior à última troca
 * de senha do usuário — ou seja, deve ser rejeitado. Sem marca no Redis (caso
 * comum), retorna false.
 */
export async function isTokenStale(
  userId: string,
  iatSeconds?: number
): Promise<boolean> {
  if (!iatSeconds) return false;
  await ensureConnected();
  const raw = await redis.get(`${PWD_CHANGED_PREFIX}${userId}`);
  if (!raw) return false;
  const changedAtMs = Number(raw);
  if (!Number.isFinite(changedAtMs)) return false;
  // iat vem em segundos; comparamos contra a troca em segundos (floor).
  return iatSeconds <= Math.floor(changedAtMs / 1000);
}
