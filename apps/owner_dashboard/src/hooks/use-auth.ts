import { create } from 'zustand';
import { isAuthenticated as checkAuth } from '@/lib/api';

interface AuthState {
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set) => ({
  isLoading: true,
  setLoading: (loading) => set({ isLoading: loading }),
  isAuthenticated: () => checkAuth(),
}));