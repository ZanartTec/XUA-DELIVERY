import { create } from "zustand";

export interface AuthUser {
  id: string;
  name: string;
  role: "consumer" | "distributor_admin" | "driver" | "ops" | "support";
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  hydrated: boolean;
  setUser: (user: AuthUser) => void;
  setHydrated: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  hydrated: false,

  setUser: (user) => set({ user, isAuthenticated: true, hydrated: true }),

  setHydrated: () => set({ hydrated: true }),

  logout: () => set({ user: null, isAuthenticated: false, hydrated: true }),
}));
