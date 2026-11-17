import type { RealtimeEventName, RealtimePayloads } from "@xua/shared/realtime/events";

export type RealtimeHandler<E extends RealtimeEventName> = (payload: RealtimePayloads[E]) => void;

/**
 * Registro de ouvintes independente do socket.
 *
 * A causa do F2 era registrar o ouvinte direto no socket: quem chamava `on`
 * antes de o socket existir (F5, link direto) ficava sem nada. Aqui o ouvinte
 * entra num `Set` que vive o tempo todo; o socket, quando existir, só repassa
 * cada evento para `emit`. Registrar antes ou depois de conectar dá no mesmo.
 */
export function createListenerRegistry(onHandlerError?: (event: string, error: unknown) => void) {
  const handlers = new Map<RealtimeEventName, Set<(payload: unknown) => void>>();

  return {
    on<E extends RealtimeEventName>(event: E, handler: RealtimeHandler<E>): () => void {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      const wrapped = handler as (payload: unknown) => void;
      set.add(wrapped);
      return () => {
        set.delete(wrapped);
      };
    },

    emit<E extends RealtimeEventName>(event: E, payload: RealtimePayloads[E]): void {
      const set = handlers.get(event);
      if (!set) return;
      // Cópia: um handler que se desregistra durante o loop não pula o próximo.
      for (const handler of [...set]) {
        try {
          handler(payload);
        } catch (error) {
          // Um handler com erro não pode derrubar os outros nem o socket.
          onHandlerError?.(event, error);
        }
      }
    },

    count(event: RealtimeEventName): number {
      return handlers.get(event)?.size ?? 0;
    },
  };
}

export type ListenerRegistry = ReturnType<typeof createListenerRegistry>;
