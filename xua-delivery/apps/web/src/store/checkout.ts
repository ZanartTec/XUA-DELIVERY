import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CheckoutPaymentMethod, DeliveryWindowInput } from "@xua/shared/enums";
import { DEFAULT_CHECKOUT_PAYMENT_METHOD } from "@xua/shared/mappers/payment";

type TimeWindow = DeliveryWindowInput;
type PaymentMethod = CheckoutPaymentMethod;

interface CheckoutState {
  // Schedule step
  selectedDate: string | null;
  selectedWindow: TimeWindow | null;
  selectedSlotId: string | null;
  instructions: string;
  selectedAddressId: string | null;

  // Distributor step
  selectedDistributorId: string | null;

  // Payment step
  paymentMethod: PaymentMethod;
  cashChangeForCents: number | null;

  // Actions
  setSelectedDate: (date: string | null) => void;
  setSelectedWindow: (window: TimeWindow | null) => void;
  setSelectedSlotId: (id: string | null) => void;
  setInstructions: (text: string) => void;
  setSelectedAddressId: (id: string | null) => void;
  setSelectedDistributorId: (id: string | null) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setCashChangeForCents: (cents: number | null) => void;

  /** Reset all checkout state (after order placed or cart cleared) */
  resetCheckout: () => void;
}

const initialState = {
  selectedDate: null,
  selectedWindow: null as TimeWindow | null,
  selectedSlotId: null as string | null,
  instructions: "",
  selectedAddressId: null,
  selectedDistributorId: null as string | null,
  paymentMethod: DEFAULT_CHECKOUT_PAYMENT_METHOD,
  cashChangeForCents: null as number | null,
};

export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set) => ({
      ...initialState,

      setSelectedDate: (date) => set({ selectedDate: date }),
      setSelectedWindow: (window) => set({ selectedWindow: window }),
      setSelectedSlotId: (id) => set({ selectedSlotId: id }),
      setInstructions: (text) => set({ instructions: text }),
      setSelectedAddressId: (id) => set({ selectedAddressId: id }),
      setSelectedDistributorId: (id) => set({ selectedDistributorId: id }),
      setPaymentMethod: (method) => set({ paymentMethod: method }),
      setCashChangeForCents: (cents) => set({ cashChangeForCents: cents }),

      resetCheckout: () => set(initialState),
    }),
    {
      name: "xua-checkout",
    },
  ),
);
