import { create } from "zustand";
import { persist } from "zustand/middleware";

type TimeWindow = "morning" | "afternoon";
type PaymentMethod = "pix" | "credit" | "cash";

interface CheckoutState {
  // Schedule step
  selectedDate: string | null;
  selectedWindow: TimeWindow | null;
  instructions: string;
  selectedAddressId: string | null;

  // Distributor step
  selectedDistributorId: string | null;

  // Payment step
  paymentMethod: PaymentMethod;

  // Actions
  setSelectedDate: (date: string) => void;
  setSelectedWindow: (window: TimeWindow) => void;
  setInstructions: (text: string) => void;
  setSelectedAddressId: (id: string | null) => void;
  setSelectedDistributorId: (id: string | null) => void;
  setPaymentMethod: (method: PaymentMethod) => void;

  /** Reset all checkout state (after order placed or cart cleared) */
  resetCheckout: () => void;
}

const initialState = {
  selectedDate: null,
  selectedWindow: null as TimeWindow | null,
  instructions: "",
  selectedAddressId: null,
  selectedDistributorId: null as string | null,
  paymentMethod: "pix" as PaymentMethod,
};

export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set) => ({
      ...initialState,

      setSelectedDate: (date) => set({ selectedDate: date }),
      setSelectedWindow: (window) => set({ selectedWindow: window }),
      setInstructions: (text) => set({ instructions: text }),
      setSelectedAddressId: (id) => set({ selectedAddressId: id }),
      setSelectedDistributorId: (id) => set({ selectedDistributorId: id }),
      setPaymentMethod: (method) => set({ paymentMethod: method }),

      resetCheckout: () => set(initialState),
    }),
    {
      name: "xua-checkout",
    },
  ),
);
