import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, UserRole } from '../types';
import { supabase } from '../lib/supabase';

export type PermissionModule = 'admin' | 'tables' | 'orders' | 'kitchen' | 'billing' | 'bill_history' | 'menu' | 'inventory' | 'reports' | 'customers';

export const ALL_MODULES: { id: PermissionModule; label: string; description: string }[] = [
  { id: 'admin', label: 'Dashboard & Admin', description: 'Dashboard, settings, staff management, shift management, accounting, head count' },
  { id: 'tables', label: 'Table Management', description: 'View and manage restaurant tables' },
  { id: 'orders', label: 'Order Taking', description: 'Create and manage customer orders' },
  { id: 'kitchen', label: 'Kitchen Display', description: 'View and update KOT orders' },
  { id: 'billing', label: 'Billing & Counters', description: 'Process bills, bakery and juice counters' },
  { id: 'bill_history', label: 'Bill History', description: 'View, search and void past bills and invoices' },
  { id: 'menu', label: 'Menu Management', description: 'Add, edit and delete menu items' },
  { id: 'inventory', label: 'Inventory', description: 'Manage stock and inventory' },
  { id: 'reports', label: 'Reports & Analytics', description: 'View sales reports, GST filing and analytics dashboards' },
  { id: 'customers', label: 'Customers', description: 'Access customer records' },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, PermissionModule[]> = {
  admin: ['admin', 'tables', 'orders', 'kitchen', 'billing', 'bill_history', 'menu', 'inventory', 'reports', 'customers'],
  manager: ['tables', 'orders', 'billing', 'bill_history', 'inventory', 'menu', 'customers', 'kitchen', 'reports'],
  cashier: ['billing', 'bill_history', 'orders', 'customers'],
  waiter: ['tables', 'orders', 'menu'],
  kitchen: ['kitchen'],
};

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
  }, { onConflict: 'id' });
  
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
  rolePermissions: Record<UserRole, PermissionModule[]>;

  login: (pin: string) => boolean;
  logout: () => void;
  addUser: (user: Omit<User, 'id' | 'createdAt'>) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  deactivateUser: (id: string) => void;
  deleteUser: (id: string) => void;
  fetchUsers: () => Promise<void>;
  initUserSync: () => void;
  updateRolePermissions: (role: UserRole, modules: PermissionModule[]) => void;
  loadRolePermissions: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      isAuthenticated: false,
      allUsers: DEMO_USERS,
      usersLoaded: false,
      rolePermissions: { ...DEFAULT_ROLE_PERMISSIONS },

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

        // Real-time: listen for role permissions changes from app_settings
        const existing = supabase.getChannels().find(c => c.topic === 'realtime:public:app_settings');
        if (!existing) {
          supabase.channel('public:app_settings')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload) => {
              if (payload.new && (payload.new as any).id === 'roles') {
                const saved = (payload.new as any).printers as Record<UserRole, PermissionModule[]>;
                if (saved) {
                  set({ rolePermissions: { ...DEFAULT_ROLE_PERMISSIONS, ...saved } });
                }
              }
            })
            .subscribe();
        } else {
          // If already subscribed (e.g. by settingsStore), we can't easily add another handler to the same channel
          // without storing the channel reference. Instead, we'll create a dedicated channel for auth
          supabase.channel('auth_app_settings')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload) => {
              if (payload.new && (payload.new as any).id === 'roles') {
                const saved = (payload.new as any).printers as Record<UserRole, PermissionModule[]>;
                if (saved) {
                  set({ rolePermissions: { ...DEFAULT_ROLE_PERMISSIONS, ...saved } });
                }
              }
            })
            .subscribe();
        }
      },

      updateRolePermissions: async (role, modules) => {
        set((state) => ({
          rolePermissions: { ...state.rolePermissions, [role]: modules }
        }));
        // Persist to Supabase app_settings (using id 'roles' and storing JSON in printers column)
        try {
          const current = get().rolePermissions;
          const updated = { ...current, [role]: modules };
          await supabase.from('app_settings').upsert(
            { id: 'roles', printers: updated, updated_at: new Date().toISOString() },
            { onConflict: 'id' }
          );
        } catch (e) {
          console.error('Failed to save role permissions:', e);
        }
      },

      loadRolePermissions: async () => {
        try {
          const { data } = await supabase
            .from('app_settings')
            .select('printers')
            .eq('id', 'roles')
            .single();
          if (data?.printers) {
            const saved = data.printers as Record<UserRole, PermissionModule[]>;
            set({ rolePermissions: { ...DEFAULT_ROLE_PERMISSIONS, ...saved } });
          }
        } catch (e) {
          // offline or not saved yet — use defaults
        }
      },
    }),
    {
      name: 'railway-coach-auth',
      partialize: (state) => ({
        currentUser: state.currentUser,
        isAuthenticated: state.isAuthenticated,
        rolePermissions: state.rolePermissions,
      }),
    }
  )
);

// Keep static constant for backward compat (used in places that can't use hooks)
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = DEFAULT_ROLE_PERMISSIONS;

// Static check — used in non-hook contexts only. Reads from persisted store.
export function hasPermission(role: UserRole, module: string): boolean {
  const perms = useAuthStore.getState().rolePermissions[role] ?? DEFAULT_ROLE_PERMISSIONS[role] ?? [];
  return role === 'admin' || perms.includes(module as PermissionModule);
}

// React hook version for reactive UI updates
export function useHasPermission(module: string): boolean {
  const currentUser = useAuthStore(s => s.currentUser);
  const rolePermissions = useAuthStore(s => s.rolePermissions);
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  const perms = rolePermissions[currentUser.role] ?? DEFAULT_ROLE_PERMISSIONS[currentUser.role] ?? [];
  return perms.includes(module as PermissionModule);
}
