import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getRenderableProductImageUrl } from "@/src/lib/product-image";

interface CartItem {
  product_id: string;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  image_url?: string | null;
  // Vasilhame vinculado (apenas itens de água kind=WATER). Usado no settlement de caução.
  bottle_product_id?: string | null;
}

interface CartState {
  items: CartItem[];
  // Vazios para troca por tipo de vasilhame: { [bottle_product_id]: quantidade }.
  emptyBottlesByBottle: Record<string, number>;
  selectedDistributorId: string | null;
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (productId: string) => void;
  updateQty: (productId: string, quantity: number) => void;
  setEmptyBottlesForBottle: (bottleProductId: string, qty: number) => void;
  setSelectedDistributorId: (id: string | null) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getSubtotalCents: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      emptyBottlesByBottle: {},
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
          return {
            items: [
              ...state.items,
              { ...item, image_url: getRenderableProductImageUrl(item.image_url), quantity: 1 },
            ],
          };
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

      setEmptyBottlesForBottle: (bottleProductId, qty) =>
        set((state) => ({
          emptyBottlesByBottle: {
            ...state.emptyBottlesByBottle,
            [bottleProductId]: Math.max(0, qty),
          },
        })),

      setSelectedDistributorId: (id) => set({ selectedDistributorId: id }),

      clearCart: () => set({ items: [], emptyBottlesByBottle: {}, selectedDistributorId: null }),

      getTotalItems: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),

      getSubtotalCents: () =>
        get().items.reduce(
          (acc, item) => acc + item.unit_price_cents * item.quantity,
          0
        ),
    }),
    { name: "xua-cart" }
  )
);
