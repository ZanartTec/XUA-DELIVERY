import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Criptografia simétrica para segredos em repouso (ex.: access token e webhook
 * secret do Mercado Pago de cada distribuidora).
 *
 * Algoritmo: AES-256-GCM. Formato armazenado (texto): "iv:authTag:ciphertext",
 * cada parte em base64. A chave mestra vem de ENCRYPTION_MASTER_KEY (32 bytes,
 * em hex de 64 chars ou base64). É resolvida sob demanda (lazy) e cacheada —
 * assim a API sobe mesmo sem a env, falhando apenas ao cifrar/decifrar.
 */
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // recomendado para GCM
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;

function parseMasterKey(raw: string | undefined): Buffer {
  if (!raw) {
    throw new Error(
      "FATAL: ENCRYPTION_MASTER_KEY não definido. Defina 32 bytes (hex de 64 chars ou base64) antes de cifrar segredos."
    );
  }
  const normalized = raw.trim();

  // Tenta hex (64 chars) e depois base64.
  let key: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(normalized)) {
    key = Buffer.from(normalized, "hex");
  } else {
    const decoded = Buffer.from(normalized, "base64");
    if (decoded.length === KEY_BYTES) key = decoded;
  }

  if (!key || key.length !== KEY_BYTES) {
    throw new Error(
      "FATAL: ENCRYPTION_MASTER_KEY inválido. Use exatamente 32 bytes (hex de 64 chars ou base64 de 32 bytes)."
    );
  }
  return key;
}

function getMasterKey(): Buffer {
  if (!cachedKey) {
    cachedKey = parseMasterKey(process.env.ENCRYPTION_MASTER_KEY);
  }
  return cachedKey;
}

/** Cifra um texto em claro e devolve "iv:authTag:ciphertext" (base64). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getMasterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    ":"
  );
}

/** Decifra um payload no formato "iv:authTag:ciphertext" (base64). */
export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("ENCRYPTED_SECRET_MALFORMED");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, getMasterKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Máscara para exibição segura de um segredo (ex.: "****1234").
 * Recebe o texto EM CLARO (já decifrado) e nunca o segredo inteiro.
 */
export function maskSecret(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  const last4 = plaintext.slice(-4);
  return `****${last4}`;
}
