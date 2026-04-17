import { create } from "zustand";
import { persist } from "zustand/middleware";

type TimeWindow = "morning" | "afternoon";
type PaymentMethod = "pix" | "credit" | "cash";

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

  // Actions
  setSelectedDate: (date: string | null) => void;
  setSelectedWindow: (window: TimeWindow | null) => void;
  setSelectedSlotId: (id: string | null) => void;
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
  selectedSlotId: null as string | null,
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
      setSelectedSlotId: (id) => set({ selectedSlotId: id }),
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
