import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore, hasPermission } from './store/authStore';
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

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TableManagement from './pages/TableManagement';
import OrderTaking from './pages/OrderTaking';
import KitchenDisplay from './pages/KitchenDisplay';
import Billing from './pages/Billing';
import MenuManagement from './pages/MenuManagement';
import Inventory from './pages/Inventory';
import Reports from './pages/Reports';
import GstFiling from './pages/GstFiling';
import Settings from './pages/Settings';
import BakeryCounter from './pages/BakeryCounter';
import JuiceCounter from './pages/JuiceCounter';
import StaffManagement from './pages/StaffManagement';
import BillHistory from './pages/BillHistory';
import ShiftManagement from './pages/ShiftManagement';
import Analytics from './pages/Analytics';
import HeadCount from './pages/HeadCount';
import Accounting from './pages/Accounting';

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
        {children}
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
  if (!currentUser) return <Navigate to="/login" replace />;
  
  if (!hasPermission(currentUser.role, module)) {
    // Redirect unauthorized users to their most appropriate default page
    if (currentUser.role === 'manager' || currentUser.role === 'waiter') return <Navigate to="/tables" replace />;
    if (currentUser.role === 'cashier') return <Navigate to="/billing" replace />;
    if (currentUser.role === 'kitchen') return <Navigate to="/kitchen" replace />;
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
    
    // Auto-refresh when tablet wakes up from sleep
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        useOrderStore.getState().fetchActiveOrders();
        useAuthStore.getState().fetchUsers();
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
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />

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
