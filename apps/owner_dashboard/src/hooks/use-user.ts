import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  tenant_id: string;
}

interface UserState {
  user: User | null;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => set({ user: null }),
}));