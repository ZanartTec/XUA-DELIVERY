import type { QueryKey } from "./invalidation-map";

interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Junta chaves de invalidação que chegam em rajada e entrega um lote só.
 *
 * A geração de assinaturas pode mandar dezenas de `new_order` em segundos;
 * sem isto cada um viraria uma ida à API. A janela começa no primeiro evento e
 * não é estendida pelos seguintes, então o atraso máximo é `delayMs`.
 */
export function createKeyCoalescer(
  flush: (keys: QueryKey[]) => void,
  delayMs = 300,
  timers: Timers = defaultTimers
) {
  const pending = new Map<string, QueryKey>();
  let handle: unknown = null;

  function run() {
    handle = null;
    if (pending.size === 0) return;
    const keys = [...pending.values()];
    pending.clear();
    flush(keys);
  }

  return {
    add(keys: readonly QueryKey[]): void {
      for (const key of keys) pending.set(JSON.stringify(key), key);
      if (handle === null && pending.size > 0) handle = timers.setTimeout(run, delayMs);
    },

    flushNow(): void {
      if (handle !== null) timers.clearTimeout(handle);
      run();
    },

    dispose(): void {
      if (handle !== null) timers.clearTimeout(handle);
      handle = null;
      pending.clear();
    },
  };
}
