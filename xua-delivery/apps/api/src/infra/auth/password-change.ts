import redis, { ensureConnected } from "../redis/client";

const PWD_CHANGED_PREFIX = "pwd:changed:";

// TTL = vida máxima de um JWT (24h). Depois disso nenhum token antigo existe,
// então a marca pode expirar sem risco. Mesmo padrão do blacklist por-jti.
const TTL_SECONDS = 60 * 60 * 24;

/**
 * Invalida (torna obsoleto) qualquer JWT emitido antes de `atMs` para o
 * usuário. Chave compartilhada por qualquer evento que deva encerrar sessões
 * ativas — hoje: troca de senha e desativação de conta (`is_active=false`).
 */
async function invalidateSessionsIssuedBefore(userId: string, atMs: number): Promise<void> {
  await ensureConnected();
  await redis.set(`${PWD_CHANGED_PREFIX}${userId}`, String(atMs), "EX", TTL_SECONDS);
}

/**
 * Registra que a senha do usuário mudou em `atMs` (epoch ms). Qualquer JWT
 * emitido antes desse instante passa a ser considerado inválido.
 */
export async function markPasswordChanged(
  userId: string,
  atMs: number = Date.now()
): Promise<void> {
  await invalidateSessionsIssuedBefore(userId, atMs);
}

/**
 * Registra que a conta do usuário foi desativada (`is_active=false`) em
 * `atMs`. Mesma mecânica de `markPasswordChanged`: qualquer JWT já emitido
 * (sessão ativa) passa a ser rejeitado por `isTokenStale` no próximo request
 * — sem isso, desativar um motorista/admin não teria efeito até o token
 * expirar naturalmente (até 24h depois).
 */
export async function markAccountDeactivated(
  userId: string,
  atMs: number = Date.now()
): Promise<void> {
  await invalidateSessionsIssuedBefore(userId, atMs);
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
