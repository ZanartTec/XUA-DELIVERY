import redis, { ensureConnected } from "../redis/client";

const USED_PREFIX = "jwt:socket-ticket:";

/**
 * Marca o passe do socket como usado. Devolve `false` se ele já tinha sido
 * usado: um passe vazado (log, proxy) não abre uma segunda conexão.
 * A marca expira junto com o passe.
 */
export async function consumeSocketTicket(jti: string, expiresAt: number): Promise<boolean> {
  await ensureConnected();
  const ttlSeconds = Math.max(expiresAt - Math.floor(Date.now() / 1000), 1);
  const result = await redis.set(`${USED_PREFIX}${jti}`, "1", "EX", ttlSeconds, "NX");
  return result === "OK";
}
