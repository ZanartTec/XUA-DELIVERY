import { createLogger } from "../../../infra/logger/index.js";

const log = createLogger("push-dispatcher");

/**
 * Intenção de push (Web Push). É o formato do job da fila `notifications`
 * (T5.3): quem decide QUEM recebe e O QUE recebe são as regras de domínio;
 * o envio de fato (resolver tokens, VAPID, retry) é do processor da Fase 5.
 */
export interface PushIntent {
  /** `user`: um usuário (cliente, motorista, ops). `distributor`: todos os admins ativos da distribuidora. */
  target: { kind: "user" | "distributor"; id: string };
  title: string;
  body: string;
  /** Tela aberta ao tocar na notificação. */
  url: string;
  /** Agrupa notificações do mesmo assunto (ex.: `order-<id>`). */
  tag: string;
  urgency: "high" | "normal" | "low";
  ttlSeconds: number;
  /** Vira o `jobId` do BullMQ: dois enfileiramentos iguais geram um job só. */
  dedupeKey: string;
  /** Usado pelo service worker (ex.: `new_order` pede interação). */
  kind: string;
  /** Sem som/vibração (resumo de assinaturas — D6). */
  silent?: boolean;
}

type PushSink = (intent: PushIntent) => Promise<void>;

/**
 * Até a fila `notifications` existir (Fase 5), as intenções só são registradas
 * em log. Os pushes que já existiam (despacho e entrega ao cliente) continuam
 * saindo pelo `notificationService.send` inline até a T5.5 trocá-los por aqui.
 */
const logOnlySink: PushSink = async (intent) => {
  log.debug(
    { target: intent.target, kind: intent.kind, dedupeKey: intent.dedupeKey },
    "Push intent recorded (queue not wired yet)"
  );
};

let sink: PushSink = logOnlySink;

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

  /** Troca o destino (o producer BullMQ na Fase 5; um espião nos testes). */
  setSink(next: PushSink | null): void {
    sink = next ?? logOnlySink;
  },
};
