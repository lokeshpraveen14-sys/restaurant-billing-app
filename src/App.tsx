import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useUIStore } from './store/uiStore';
import { useTableStore } from './store/tableStore';
import { useMenuStore } from './store/menuStore';
import { useOrderStore } from './store/orderStore';
import { useBillStore } from './store/billStore';
import { useShiftStore } from './store/shiftStore';

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
import Settings from './pages/Settings';
import BakeryCounter from './pages/BakeryCounter';
import JuiceCounter from './pages/JuiceCounter';
import StaffManagement from './pages/StaffManagement';
import BillHistory from './pages/BillHistory';
import ShiftManagement from './pages/ShiftManagement';
import Analytics from './pages/Analytics';
import HeadCount from './pages/HeadCount';

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

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const theme = useUIStore((s) => s.theme);
  const initTableSync = useTableStore((s) => s.initTableSync);
  const initMenuSync = useMenuStore((s) => s.initMenuSync);
  const initOrderSync = useOrderStore((s) => s.initOrderSync);
  const initBillSync = useBillStore((s) => s.initBillSync);
  const initShiftSync = useShiftStore((s) => s.initShiftSync);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  React.useEffect(() => {
    initTableSync();
    initMenuSync();
    initOrderSync();
    initBillSync();
    initShiftSync();
    
    // Auto-refresh when tablet wakes up from sleep
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        useOrderStore.getState().fetchActiveOrders();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [initTableSync, initMenuSync, initOrderSync, initBillSync, initShiftSync]);

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
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/tables" element={<TableManagement />} />
                  <Route path="/order" element={<OrderTaking />} />
                  <Route path="/kitchen" element={<KitchenDisplay />} />
                  <Route path="/billing" element={<Billing />} />
                  <Route path="/menu" element={<MenuManagement />} />
                  <Route path="/bakery" element={<BakeryCounter />} />
                  <Route path="/juice" element={<JuiceCounter />} />
                  <Route path="/inventory" element={<Inventory />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/shift" element={<ShiftManagement />} />
                  <Route path="/bills" element={<BillHistory />} />
                  <Route path="/staff" element={<StaffManagement />} />
                  <Route path="/headcount" element={<HeadCount />} />
                  <Route path="/settings" element={<Settings />} />
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
