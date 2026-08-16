import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, UserRole } from '../types';

// Demo users for development
export const DEMO_USERS: User[] = [
  { id: '1', name: 'Admin User', email: 'admin@railwaycoach.com', role: 'admin', pin: '1234', active: true, createdAt: new Date() },
  { id: '2', name: 'Ravi Kumar', email: 'manager@railwaycoach.com', role: 'manager', pin: '2345', active: true, createdAt: new Date() },
  { id: '3', name: 'Priya Sharma', email: 'cashier@railwaycoach.com', role: 'cashier', pin: '3456', active: true, createdAt: new Date() },
  { id: '4', name: 'Mohan Raj', email: 'waiter@railwaycoach.com', role: 'waiter', pin: '4567', active: true, createdAt: new Date() },
  { id: '5', name: 'Chef Suresh', email: 'kitchen@railwaycoach.com', role: 'kitchen', pin: '5678', active: true, createdAt: new Date() },
];

interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  login: (pin: string) => boolean;
  logout: () => void;
  allUsers: User[];
  addUser: (user: Omit<User, 'id' | 'createdAt'>) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  deactivateUser: (id: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      isAuthenticated: false,
      allUsers: DEMO_USERS,

      login: (pin: string) => {
        const user = get().allUsers.find((u) => u.pin === pin && u.active);
        if (user) {
          set({ currentUser: user, isAuthenticated: true });
          return true;
        }
        return false;
      },

      logout: () => set({ currentUser: null, isAuthenticated: false }),

      addUser: (userData) => {
        const newUser: User = {
          ...userData,
          id: crypto.randomUUID(),
          createdAt: new Date(),
        };
        set((state) => ({ allUsers: [...state.allUsers, newUser] }));
      },

      updateUser: (id, updates) => {
        set((state) => ({
          allUsers: state.allUsers.map((u) => (u.id === id ? { ...u, ...updates } : u)),
        }));
      },

      deactivateUser: (id) => {
        set((state) => ({
          allUsers: state.allUsers.map((u) => (u.id === id ? { ...u, active: false } : u)),
        }));
      },
    }),
    { name: 'railway-coach-auth' }
  )
);

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ['all'],
  manager: ['tables', 'orders', 'billing', 'inventory', 'reports', 'menu', 'customers', 'kitchen'],
  cashier: ['billing', 'orders', 'customers', 'reports'],
  waiter: ['tables', 'orders', 'menu'],
  kitchen: ['kitchen'],
};

export function hasPermission(role: UserRole, module: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms.includes('all') || perms.includes(module);
}
