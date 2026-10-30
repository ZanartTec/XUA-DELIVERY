import type { Order, Product } from "@prisma/client";
import type { DeliveryWindow } from "@xua/shared/enums";
import type { CreateOrderInput } from "@xua/shared/schemas/order";
import { badRequest, notFound } from "../../../errors/index.js";
import { consumerRepository } from "../../consumers/repository/consumers.repository.js";
import { zonesRepository } from "../../zones/repository/zones.repository.js";
import { productsRepository } from "../../products/repository/products.repository.js";
import { distributorService } from "../../distributor/services/distributor.service.js";
import { createOrderService } from "./create-order.service.js";

/**
 * Checkout do consumidor: resolve endereço, zona, preços e distribuidora a
 * partir do payload validado e delega a criação para createOrder.
 *
 * Isto vivia dentro do orders.controller, que consultava o Prisma direto —
 * o controller não tinha como ser testado sem banco e conhecia o schema de
 * três tabelas de outros módulos. Aqui o acesso a dados passa pelos
 * repositories donos de cada tabela.
 */
export const checkoutService = {
  async createOrderFromCheckout(consumerId: string, input: CreateOrderInput): Promise<Order> {
    // FUNC-03: a zona e a distribuidora saem do endereço, nunca do payload.
    const address = await consumerRepository.findAddressOwnedBy(input.address_id, consumerId);
    if (!address) throw notFound("Endereço não encontrado");
    if (!address.zone_id) throw badRequest("Endereço sem zona de entrega configurada");

    const zone = await zonesRepository.findActiveById(address.zone_id);
    if (!zone) throw badRequest("Zona de entrega inativa");

    // Preço vem sempre do banco — o que o cliente mandou é ignorado.
    const productIds = input.items.map((item) => item.product_id);
    const products = await productsRepository.findActiveByIds(productIds);
    if (products.length !== productIds.length) {
      throw badRequest("Um ou mais produtos inválidos ou inativos");
    }
    const productById = new Map(products.map((product: Product) => [product.id, product] as const));

    const resolved = await distributorService.resolveDistributor(
      consumerId,
      zone.id,
      input.delivery_date,
      input.delivery_window,
      input.distributor_id
    );

    return createOrderService.createOrder({
      consumerId,
      addressId: input.address_id,
      distributorId: resolved.distributorId,
      zoneId: resolved.zoneId,
      deliveryDate: input.delivery_date,
      deliveryWindow: input.delivery_window.toUpperCase() as DeliveryWindow,
      distributorSelectionMode: resolved.mode,
      timeSlotId: input.time_slot_id ?? null,
      deliveryInstructions: input.delivery_instructions ?? null,
      paymentMethod: input.payment_method,
      cashChangeForCents: input.cash_change_for_cents ?? null,
      emptyBottles: input.empty_bottles,
      items: input.items.map((item) => {
        const product = productById.get(item.product_id)!;
        return {
          product_id: item.product_id,
          product_name: product.name,
          unit_price_cents: product.price_cents,
          quantity: item.quantity,
        };
      }),
    });
  },
};
