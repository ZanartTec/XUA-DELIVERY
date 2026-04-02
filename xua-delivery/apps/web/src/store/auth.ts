import { create } from "zustand";

interface User {
  id: string;
  name: string;
  // SEC-11: Adicionado role driver
  role: "consumer" | "distributor_admin" | "operator" | "driver" | "ops" | "support";
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,

  setUser: (user) => set({ user, isAuthenticated: true }),

  logout: () => set({ user: null, isAuthenticated: false }),
}));
