import { createLogger } from "../../../infra/logger/index.js";
import type { PushIntent } from "../../../infra/queue/contracts.js";

export type { PushIntent };

const log = createLogger("push-dispatcher");

type PushSink = (intent: PushIntent) => Promise<void>;

/**
 * Destino padrão: a fila BullMQ `notifications` (T5.3). O envio sai do caminho
 * da requisição e ganha retry; o processor roda no worker. Importado sob
 * demanda para que testes e scripts que só calculam intenções não abram
 * conexão com o Redis.
 */
const queueSink: PushSink = async (intent) => {
  const { enqueuePushNotification } = await import("../../../infra/queue/notifications.producer.js");
  await enqueuePushNotification(intent);
};

let sink: PushSink = queueSink;

export const pushDispatcher = {
  /** Nunca lança: push é efeito colateral e não pode derrubar a transição já comitada. */
  async enqueue(intent: PushIntent): Promise<void> {
    try {
      await sink(intent);
    } catch (err) {
      log.warn({ err, dedupeKey: intent.dedupeKey }, "Push enqueue failed");
    }
  },

  async enqueueAll(intents: readonly PushIntent[]): Promise<void> {
    await Promise.all(intents.map((intent) => pushDispatcher.enqueue(intent)));
  },

  /** Troca o destino (um espião nos testes); `null` volta para a fila. */
  setSink(next: PushSink | null): void {
    sink = next ?? queueSink;
  },
};
