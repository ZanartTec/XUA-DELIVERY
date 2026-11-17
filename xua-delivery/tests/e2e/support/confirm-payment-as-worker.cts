/**
 * E4 (regressão do F1): um pedido pago online é confirmado FORA do processo da
 * API, do jeito que o worker faz depois do webhook do Mercado Pago — mesmo
 * inicializador (`initRealtimeEmitter`) e mesmos serviços. Se o aviso não
 * atravessar o Redis, a fila da distribuidora não recebe o pedido.
 *
 * O pedido PIX é criado aqui mesmo pelo serviço interno: a distribuidora do
 * seed não aceita PIX no checkout de dev (sem Mercado Pago configurado), e o
 * que o teste prova é o caminho do worker, não o checkout.
 *
 * Uso (a partir de apps/api, para pegar o .env):
 *   node --env-file=.env --import tsx ../../tests/e2e/support/confirm-payment-as-worker.cts \
 *     <consumerId> <addressId> <distributorId> <timeSlotId> <productId> <yyyy-mm-dd>
 * Imprime `E4_RESULT {"orderId": ..., "transitioned": ...}`.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { initRealtimeEmitter, closeRealtime } = require("../../../apps/api/src/infra/realtime/publisher");
const { createOrderService } = require("../../../apps/api/src/modules/orders/services/create-order.service");
const { getPrisma, disconnectPrisma } = require("../../../apps/api/src/infra/prisma/client");

(async () => {
  const [consumerId, addressId, distributorId, timeSlotId, productId, deliveryDate] = process.argv.slice(2);
  if (!deliveryDate) throw new Error("argumentos: consumerId addressId distributorId timeSlotId productId data");

  const prisma = getPrisma();
  const address = await prisma.address.findUniqueOrThrow({ where: { id: addressId } });
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

  await initRealtimeEmitter();
  const order = await createOrderService.createOrder({
    consumerId,
    addressId,
    distributorId,
    zoneId: address.zone_id,
    deliveryDate,
    deliveryWindow: "MORNING",
    distributorSelectionMode: "manual",
    timeSlotId,
    paymentMethod: "pix",
    skipPaymentMethodValidation: true,
    items: [{ product_id: product.id, product_name: product.name, unit_price_cents: product.price_cents, quantity: 1 }],
  });

  // Caminho do worker após o webhook aprovado.
  await createOrderService.submitForPayment(order.id);
  await createOrderService.confirmOrder(order.id);
  const { transitioned } = await createOrderService.sendToDistributor(order.id);

  // Dá tempo de o emitter publicar antes de fechar a conexão.
  await new Promise((resolve) => setTimeout(resolve, 500));
  await closeRealtime();
  await disconnectPrisma();
  // Marcador: os logs do pino podem sair depois desta linha.
  console.log(`E4_RESULT ${JSON.stringify({ orderId: order.id, transitioned })}`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
