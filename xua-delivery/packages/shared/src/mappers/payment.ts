import {
  CHECKOUT_PAYMENT_METHOD_VALUES,
  ONLINE_PAYMENT_METHOD_VALUES,
  type CheckoutPaymentMethod,
  type OnlinePaymentMethod,
} from "../enums";

export type CheckoutPaymentMethodMetadata = {
  value: CheckoutPaymentMethod;
  label: string;
  sublabel: string;
  isOnline: boolean;
};

export const DEFAULT_CHECKOUT_PAYMENT_METHOD: CheckoutPaymentMethod = CHECKOUT_PAYMENT_METHOD_VALUES[0];
export const DEFAULT_ONLINE_PAYMENT_METHOD: OnlinePaymentMethod = ONLINE_PAYMENT_METHOD_VALUES[0];
export const CASH_PAYMENT_METHOD: Extract<CheckoutPaymentMethod, "cash"> = "cash";

export const CHECKOUT_PAYMENT_METHOD_METADATA = {
  pix: {
    value: "pix",
    label: "Pix",
    sublabel: "Aprovação instantânea e segura",
    isOnline: true,
  },
  credit: {
    value: "credit",
    label: "Cartão de crédito",
    sublabel: "Checkout seguro via Mercado Pago",
    isOnline: true,
  },
  cash: {
    value: CASH_PAYMENT_METHOD,
    label: "Dinheiro na entrega",
    sublabel: "Pague ao motorista no ato da entrega",
    isOnline: false,
  },
} as const satisfies Record<CheckoutPaymentMethod, CheckoutPaymentMethodMetadata>;

export const CHECKOUT_PAYMENT_METHOD_OPTIONS = CHECKOUT_PAYMENT_METHOD_VALUES.map(
  (value) => CHECKOUT_PAYMENT_METHOD_METADATA[value]
);

export function isCheckoutPaymentMethod(value: unknown): value is CheckoutPaymentMethod {
  return typeof value === "string" && CHECKOUT_PAYMENT_METHOD_VALUES.includes(value as CheckoutPaymentMethod);
}

export function isOnlinePaymentMethod(value: unknown): value is OnlinePaymentMethod {
  return typeof value === "string" && ONLINE_PAYMENT_METHOD_VALUES.includes(value as OnlinePaymentMethod);
}

export function isCashPaymentMethod(value: unknown): value is typeof CASH_PAYMENT_METHOD {
  return value === CASH_PAYMENT_METHOD;
}

export function getCheckoutPaymentMethodMetadata(
  method: CheckoutPaymentMethod
): CheckoutPaymentMethodMetadata {
  return CHECKOUT_PAYMENT_METHOD_METADATA[method];
}

export function getCheckoutPaymentMethodLabel(method: unknown): string {
  return isCheckoutPaymentMethod(method)
    ? CHECKOUT_PAYMENT_METHOD_METADATA[method].label
    : "Método não informado";
}

export function getCheckoutPaymentMethodSublabel(method: unknown): string {
  return isCheckoutPaymentMethod(method)
    ? CHECKOUT_PAYMENT_METHOD_METADATA[method].sublabel
    : "";
}
