import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error("FATAL: REDIS_URL não definido. Defina a variável de ambiente antes de iniciar.");
}

const redis = createClient({ url: REDIS_URL });

redis.on("error", (err) => {
  console.error("[Redis] Erro de conexão:", err.message);
});

// Garante que o client está conectado antes de qualquer operação
let connectPromise: Promise<void> | null = null;

export async function ensureConnected(): Promise<void> {
  if (redis.isOpen) return;
  if (!connectPromise) {
    connectPromise = redis.connect().then(() => {
      console.log("[Redis] Conectado com sucesso");
    });
  }
  await connectPromise;
}

export default redis;
