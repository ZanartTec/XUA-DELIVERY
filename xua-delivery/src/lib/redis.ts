import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error("FATAL: REDIS_URL não definido. Defina a variável de ambiente antes de iniciar.");
}

const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on("error", (err: Error) => {
  console.error("[Redis] Erro de conexão:", err.message);
});

// ioredis conecta automaticamente; esta função garante compatibilidade com código legado
export async function ensureConnected(): Promise<void> {
  if (redis.status === "ready") return;
  if (redis.status === "connecting" || redis.status === "connect") {
    await new Promise<void>((resolve) => redis.once("ready", resolve));
    return;
  }
  await redis.connect();
  console.log("[Redis] Conectado com sucesso");
}

export default redis;
