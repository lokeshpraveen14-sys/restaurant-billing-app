import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore, hasPermission, useHasPermission } from './store/authStore';
import { useUIStore } from './store/uiStore';
import { useTableStore } from './store/tableStore';
import { useMenuStore } from './store/menuStore';
import { useOrderStore } from './store/orderStore';
import { useBillStore } from './store/billStore';
import { useShiftStore } from './store/shiftStore';
import { useSettingsStore } from './store/settingsStore';
import { useAccountingStore } from './store/accountingStore';
import { useStaffStore } from './store/staffStore';

import Sidebar from './components/layout/Sidebar';
import ToastContainer from './components/ui/ToastContainer';

// Lazy loaded pages
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const TableManagement = lazy(() => import('./pages/TableManagement'));
const OrderTaking = lazy(() => import('./pages/OrderTaking'));
const KitchenDisplay = lazy(() => import('./pages/KitchenDisplay'));
const Billing = lazy(() => import('./pages/Billing'));
const MenuManagement = lazy(() => import('./pages/MenuManagement'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Reports = lazy(() => import('./pages/Reports'));
const GstFiling = lazy(() => import('./pages/GstFiling'));
const Settings = lazy(() => import('./pages/Settings'));
const BakeryCounter = lazy(() => import('./pages/BakeryCounter'));
const JuiceCounter = lazy(() => import('./pages/JuiceCounter'));
const StaffManagement = lazy(() => import('./pages/StaffManagement'));
const BillHistory = lazy(() => import('./pages/BillHistory'));
const ShiftManagement = lazy(() => import('./pages/ShiftManagement'));
const Analytics = lazy(() => import('./pages/Analytics'));
const HeadCount = lazy(() => import('./pages/HeadCount'));
const Accounting = lazy(() => import('./pages/Accounting'));

function PageSkeleton() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%', color: 'var(--text-muted)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <div className="spinner" style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--brand-color)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        <span>Loading...</span>
      </div>
    </div>
  );
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, mobileSidebarOpen, setMobileSidebar } = useUIStore();

  return (
    <div className="app-shell">
      <Sidebar />

      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }}
          onClick={() => setMobileSidebar(false)}
        />
      )}

      <main className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <Suspense fallback={<PageSkeleton />}>
          {children}
        </Suspense>
      </main>

      <ToastContainer />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequirePermission({ module, children }: { module: string, children: React.ReactNode }) {
  const currentUser = useAuthStore((s) => s.currentUser);
  const allowed = useHasPermission(module);
  if (!currentUser) return <Navigate to="/login" replace />;
  
  if (!allowed) {
    // Redirect unauthorized users to their most appropriate default page
    const perms = useAuthStore.getState().rolePermissions[currentUser.role] ?? [];
    if (perms.includes('tables' as any)) return <Navigate to="/tables" replace />;
    if (perms.includes('billing' as any)) return <Navigate to="/billing" replace />;
    if (perms.includes('kitchen' as any)) return <Navigate to="/kitchen" replace />;
    if (perms.includes('orders' as any)) return <Navigate to="/order" replace />;
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const theme = useUIStore((s) => s.theme);
  const initTableSync = useTableStore((s) => s.initTableSync);
  const initMenuSync = useMenuStore((s) => s.initMenuSync);
  const initOrderSync = useOrderStore((s) => s.initOrderSync);
  const initBillSync = useBillStore((s) => s.initBillSync);
  const initShiftSync = useShiftStore((s) => s.initShiftSync);
  const initSettingsSync = useSettingsStore((s) => s.initSettingsSync);
  const initAccountingSync = useAccountingStore((s) => s.initAccountingSync);
  const initStaffSync = useStaffStore((s) => s.initStaffSync);
  const initUserSync = useAuthStore((s) => s.initUserSync);
  const loadRolePermissions = useAuthStore((s) => s.loadRolePermissions);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  React.useEffect(() => {
    initTableSync();
    initMenuSync();
    initOrderSync();
    initBillSync();
    initShiftSync();
    initSettingsSync();
    initAccountingSync();
    initStaffSync();
    initUserSync();
    loadRolePermissions();
    
    // Auto-refresh when tablet wakes up from sleep
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        useOrderStore.getState().fetchActiveOrders();
        useAuthStore.getState().fetchUsers();
        useTableStore.getState().initTableSync();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [initTableSync, initMenuSync, initOrderSync, initBillSync, initShiftSync, initSettingsSync, initAccountingSync, initStaffSync, initUserSync]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Suspense fallback={<PageSkeleton />}>{isAuthenticated ? <Navigate to="/" replace /> : <Login />}</Suspense>} />

        <Route
          path="/*"
          element={
            <RequireAuth>
              <ProtectedLayout>
                <Routes>
                  <Route path="/" element={<RequirePermission module="admin"><Dashboard /></RequirePermission>} />
                  <Route path="/tables" element={<RequirePermission module="tables"><TableManagement /></RequirePermission>} />
                  <Route path="/order" element={<RequirePermission module="orders"><OrderTaking /></RequirePermission>} />
                  <Route path="/kitchen" element={<RequirePermission module="kitchen"><KitchenDisplay /></RequirePermission>} />
                  <Route path="/billing" element={<RequirePermission module="billing"><Billing /></RequirePermission>} />
                  <Route path="/menu" element={<RequirePermission module="menu"><MenuManagement /></RequirePermission>} />
                  <Route path="/bakery" element={<RequirePermission module="billing"><BakeryCounter /></RequirePermission>} />
                  <Route path="/juice" element={<RequirePermission module="billing"><JuiceCounter /></RequirePermission>} />
                  <Route path="/inventory" element={<RequirePermission module="inventory"><Inventory /></RequirePermission>} />
                  <Route path="/reports" element={<RequirePermission module="reports"><Reports /></RequirePermission>} />
                  <Route path="/gst-filing" element={<RequirePermission module="reports"><GstFiling /></RequirePermission>} />
                  <Route path="/settings" element={<RequirePermission module="admin"><Settings /></RequirePermission>} />
                  <Route path="/analytics" element={<RequirePermission module="reports"><Analytics /></RequirePermission>} />
                  <Route path="/shift" element={<RequirePermission module="admin"><ShiftManagement /></RequirePermission>} />
                  <Route path="/bills" element={<RequirePermission module="reports"><BillHistory /></RequirePermission>} />
                  <Route path="/staff" element={<RequirePermission module="admin"><StaffManagement /></RequirePermission>} />
                  <Route path="/accounting" element={<RequirePermission module="admin"><Accounting /></RequirePermission>} />
                  <Route path="/headcount" element={<RequirePermission module="admin"><HeadCount /></RequirePermission>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </ProtectedLayout>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
