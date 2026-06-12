import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OnlinePaymentMethod } from "@xua/shared/enums";
import { DEFAULT_ONLINE_PAYMENT_METHOD } from "@xua/shared/mappers/payment";

type SubscriptionPaymentMethod = OnlinePaymentMethod;

export interface SubscriptionWizardState {
  // Step 1 — Plan
  selectedPlanId: string | null;

  // Step 2 — Distributor
  selectedDistributorId: string | null;

  // Step 3 — Address
  selectedAddressId: string | null;

  // Step 4 — Calendar
  /** ISO date strings selected by the consumer (e.g. "2026-06-10") */
  selectedDates: string[];

  /** time_slot_id per date (key = ISO date string) */
  timeSlotsByDate: Record<string, string>;

  /** quantity of products per date (key = ISO date string) */
  quantitiesByDate: Record<string, number>;

  // Step 5 — Payment
  paymentMethod: SubscriptionPaymentMethod;

  // Actions
  setPlan: (planId: string | null) => void;
  setDistributor: (distributorId: string | null) => void;
  setAddress: (addressId: string | null) => void;
  toggleDate: (date: string) => void;
  setDates: (dates: string[]) => void;
  setTimeSlotForDate: (date: string, timeSlotId: string) => void;
  setQuantityForDate: (date: string, quantity: number) => void;
  setPaymentMethod: (method: SubscriptionPaymentMethod) => void;
  reset: () => void;
}

const initialState: Omit<
  SubscriptionWizardState,
  | "setPlan"
  | "setDistributor"
  | "setAddress"
  | "toggleDate"
  | "setDates"
  | "setTimeSlotForDate"
  | "setQuantityForDate"
  | "setPaymentMethod"
  | "reset"
> = {
  selectedPlanId: null,
  selectedDistributorId: null,
  selectedAddressId: null,
  selectedDates: [],
  timeSlotsByDate: {},
  quantitiesByDate: {},
  paymentMethod: DEFAULT_ONLINE_PAYMENT_METHOD,
};

export const useSubscriptionStore = create<SubscriptionWizardState>()(
  persist(
    (set) => ({
      ...initialState,

      setPlan: (planId) =>
        set((state) =>
          state.selectedPlanId === planId
            ? { selectedPlanId: planId }
            : {
                selectedPlanId: planId,
                selectedDistributorId: null,
                selectedDates: [],
                timeSlotsByDate: {},
                quantitiesByDate: {},
              }
        ),

      setDistributor: (distributorId) =>
        set((state) =>
          state.selectedDistributorId === distributorId
            ? { selectedDistributorId: distributorId }
            : {
                selectedDistributorId: distributorId,
                selectedDates: [],
                timeSlotsByDate: {},
                quantitiesByDate: {},
              }
        ),

      setAddress: (addressId) =>
        set((state) =>
          state.selectedAddressId === addressId
            ? { selectedAddressId: addressId }
            : {
                selectedAddressId: addressId,
                selectedDistributorId: null,
                selectedDates: [],
                timeSlotsByDate: {},
                quantitiesByDate: {},
              }
        ),

      toggleDate: (date) =>
        set((state) => {
          const already = state.selectedDates.includes(date);
          if (already) {
            const next = state.selectedDates.filter((d) => d !== date);
            const slots = { ...state.timeSlotsByDate };
            const quantities = { ...state.quantitiesByDate };
            delete slots[date];
            delete quantities[date];
            return { selectedDates: next, timeSlotsByDate: slots, quantitiesByDate: quantities };
          }
          return { selectedDates: [...state.selectedDates, date] };
        }),

      setDates: (dates) =>
        set((state) => {
          // Remove slot and quantity entries for dates no longer selected
          const slots: Record<string, string> = {};
          const quantities: Record<string, number> = {};
          for (const d of dates) {
            if (state.timeSlotsByDate[d]) slots[d] = state.timeSlotsByDate[d];
            if (state.quantitiesByDate[d]) quantities[d] = state.quantitiesByDate[d];
          }
          return { selectedDates: dates, timeSlotsByDate: slots, quantitiesByDate: quantities };
        }),

      setTimeSlotForDate: (date, timeSlotId) =>
        set((state) => ({
          timeSlotsByDate: { ...state.timeSlotsByDate, [date]: timeSlotId },
        })),

      setQuantityForDate: (date, quantity) =>
        set((state) => ({
          quantitiesByDate: { ...state.quantitiesByDate, [date]: quantity },
        })),

      setPaymentMethod: (method) => set({ paymentMethod: method }),

      reset: () => set(initialState),
    }),
    { name: "xua-subscription-wizard" }
  )
);
