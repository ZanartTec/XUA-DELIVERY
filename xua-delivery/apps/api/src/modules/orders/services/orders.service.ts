import { OrderServiceError } from "../errors.js";
import { createOrderService } from "./create-order.service.js";
import { acceptOrderService } from "./accept-order.service.js";
import { rejectOrderService } from "./reject-order.service.js";
import { dispatchOrderService } from "./dispatch-order.service.js";
import { deliverOrderService } from "./deliver-order.service.js";
import { cancelOrderService } from "./cancel-order.service.js";
import { orderRatingService } from "./order-rating.service.js";
import { orderBottleService } from "./order-bottle.service.js";
import { orderQueryService } from "./order-query.service.js";

export { OrderServiceError };

/**
 * orderService — barrel público da feature Orders.
 *
 * A lógica de negócio em si vive nos arquivos por verbo (`create-order.service.ts`,
 * `accept-order.service.ts`, etc. — ver `orders/services/`); este arquivo só agrega
 * os métodos num único objeto para preservar a API pública existente (controller,
 * jobs e o worker de pagamento continuam chamando `orderService.<método>`).
 */
export const orderService = {
  ...createOrderService,
  ...acceptOrderService,
  ...rejectOrderService,
  ...dispatchOrderService,
  ...deliverOrderService,
  ...cancelOrderService,
  ...orderRatingService,
  ...orderBottleService,
  ...orderQueryService,
};
