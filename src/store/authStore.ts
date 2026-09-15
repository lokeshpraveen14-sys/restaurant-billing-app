import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, UserRole } from '../types';
import { supabase } from '../lib/supabase';

// Fallback demo users — used only while Supabase loads, or if offline
export const DEMO_USERS: User[] = [
  { id: '1', name: 'Admin User', email: 'admin@railwaycoach.com', role: 'admin', pin: '1234', active: true, createdAt: new Date() },
  { id: '2', name: 'Ravi Kumar', email: 'manager@railwaycoach.com', role: 'manager', pin: '2345', active: true, createdAt: new Date() },
  { id: '3', name: 'Priya Sharma', email: 'cashier@railwaycoach.com', role: 'cashier', pin: '3456', active: true, createdAt: new Date() },
  { id: '4', name: 'Mohan Raj', email: 'waiter@railwaycoach.com', role: 'waiter', pin: '4567', active: true, createdAt: new Date() },
  { id: '5', name: 'Chef Suresh', email: 'kitchen@railwaycoach.com', role: 'kitchen', pin: '5678', active: true, createdAt: new Date() },
];

function mapDbUser(row: any): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email || undefined,
    role: row.role as UserRole,
    pin: row.pin,
    active: row.active,
    createdAt: new Date(row.created_at),
  };
}

async function syncUserToDB(user: User) {
  const { error } = await supabase.from('staff_users').upsert({
    id: user.id,
    name: user.name,
    email: user.email || null,
    role: user.role,
    pin: user.pin,
    active: user.active,
    created_at: new Date(user.createdAt).toISOString(),
  });
  if (error) console.error('Failed to sync user to DB:', error);
}

async function deleteUserFromDB(id: string) {
  const { error } = await supabase.from('staff_users').delete().eq('id', id);
  if (error) console.error('Failed to delete user from DB:', error);
}

interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  allUsers: User[];
  usersLoaded: boolean;

  login: (pin: string) => boolean;
  logout: () => void;
  addUser: (user: Omit<User, 'id' | 'createdAt'>) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  deactivateUser: (id: string) => void;
  deleteUser: (id: string) => void;
  fetchUsers: () => Promise<void>;
  initUserSync: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      isAuthenticated: false,
      allUsers: DEMO_USERS,
      usersLoaded: false,

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
        syncUserToDB(newUser);
      },

      updateUser: (id, updates) => {
        set((state) => ({
          allUsers: state.allUsers.map((u) => (u.id === id ? { ...u, ...updates } : u)),
          // If the currently logged-in user's PIN was updated, keep their session in sync
          currentUser: state.currentUser?.id === id
            ? { ...state.currentUser, ...updates }
            : state.currentUser,
        }));
        const updated = get().allUsers.find(u => u.id === id);
        if (updated) syncUserToDB(updated);
      },

      deactivateUser: (id) => {
        set((state) => ({
          allUsers: state.allUsers.map((u) => (u.id === id ? { ...u, active: false } : u)),
        }));
        const updated = get().allUsers.find(u => u.id === id);
        if (updated) syncUserToDB(updated);
      },

      deleteUser: (id) => {
        set((state) => ({ allUsers: state.allUsers.filter((u) => u.id !== id) }));
        deleteUserFromDB(id);
      },

      fetchUsers: async () => {
        const { data, error } = await supabase.from('staff_users').select('*');
        if (!error && data && data.length > 0) {
          set({ allUsers: data.map(mapDbUser), usersLoaded: true });
        } else {
          // DB empty or offline — keep cached/demo users
          set({ usersLoaded: true });
        }
      },

      initUserSync: () => {
        // Fetch from DB on startup
        get().fetchUsers();

        // Real-time: when any device changes a PIN/adds a user, all other devices update instantly
        supabase
          .channel('staff-users-sync')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_users' }, (payload) => {
            const { eventType, new: newRow, old: oldRow } = payload as any;

            set((state) => {
              if (eventType === 'DELETE') {
                return { allUsers: state.allUsers.filter(u => u.id !== oldRow.id) };
              }
              const updatedUser = mapDbUser(newRow);
              const exists = state.allUsers.some(u => u.id === updatedUser.id);
              const newList = exists
                ? state.allUsers.map(u => u.id === updatedUser.id ? updatedUser : u)
                : [...state.allUsers, updatedUser];

              // If the currently-logged-in user's record changed, keep session in sync
              const updatedCurrent = state.currentUser?.id === updatedUser.id
                ? updatedUser
                : state.currentUser;

              return { allUsers: newList, currentUser: updatedCurrent };
            });
          })
          .subscribe();
      },
    }),
    {
      name: 'railway-coach-auth',
      // Don't persist allUsers — always load fresh from Supabase on startup.
      // Only persist session so page refresh keeps the user logged in.
      partialize: (state) => ({
        currentUser: state.currentUser,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ['all'],
  manager: ['tables', 'orders', 'billing', 'inventory', 'menu', 'customers', 'kitchen'],
  cashier: ['billing', 'orders', 'customers'],
  waiter: ['tables', 'orders', 'menu'],
  kitchen: ['kitchen'],
};

export function hasPermission(role: UserRole, module: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms.includes('all') || perms.includes(module);
}
