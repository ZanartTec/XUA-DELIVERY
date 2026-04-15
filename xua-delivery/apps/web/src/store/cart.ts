import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CartItem {
  product_id: string;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  image_url?: string | null;
}

interface CartState {
  items: CartItem[];
  emptyBottlesQty: number;
  selectedDistributorId: string | null;
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (productId: string) => void;
  updateQty: (productId: string, quantity: number) => void;
  setEmptyBottles: (qty: number) => void;
  setSelectedDistributorId: (id: string | null) => void;
  clearCart: () => void;
  getSubtotalCents: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      emptyBottlesQty: 0,
      selectedDistributorId: null,

      addItem: (item) =>
        set((state) => {
          const existing = state.items.find(
            (i) => i.product_id === item.product_id
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.product_id === item.product_id
                  ? { ...i, quantity: i.quantity + 1 }
                  : i
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity: 1 }] };
        }),

      removeItem: (productId) =>
        set((state) => ({
          items: state.items.filter((i) => i.product_id !== productId),
        })),

      updateQty: (productId, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => i.product_id !== productId)
              : state.items.map((i) =>
                  i.product_id === productId ? { ...i, quantity } : i
                ),
        })),

      setEmptyBottles: (qty) => set({ emptyBottlesQty: qty }),

      setSelectedDistributorId: (id) => set({ selectedDistributorId: id }),

      clearCart: () => set({ items: [], emptyBottlesQty: 0, selectedDistributorId: null }),

      getSubtotalCents: () =>
        get().items.reduce(
          (acc, item) => acc + item.unit_price_cents * item.quantity,
          0
        ),
    }),
    { name: "xua-cart" }
  )
);
