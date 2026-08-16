import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  SquaresFour, Table, ClipboardText, CookingPot, Receipt, Package,
  ChartBar, Gear, Users, ForkKnife, Storefront, CaretDoubleLeft,
  CaretDoubleRight, SignOut, Drop, Timer, ChartLine,
} from '@phosphor-icons/react';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { hasPermission } from '../../store/authStore';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  module: string;
  badge?: number;
}

const NAV_GROUPS = [
  {
    label: 'Operations',
    items: [
      { label: 'Dashboard', path: '/', icon: <SquaresFour size={20} />, module: 'all' },
      { label: 'Tables', path: '/tables', icon: <Table size={20} />, module: 'tables' },
      { label: 'New Order', path: '/order', icon: <ClipboardText size={20} />, module: 'orders' },
      { label: 'Kitchen Display', path: '/kitchen', icon: <CookingPot size={20} />, module: 'kitchen' },
      { label: 'Billing', path: '/billing', icon: <Receipt size={20} />, module: 'billing' },
      { label: 'Bill History', path: '/bills', icon: <Receipt size={20} />, module: 'reports' },
      { label: 'Head Count', path: '/headcount', icon: <Users size={20} />, module: 'all' },
    ] as NavItem[],
  },
  {
    label: 'Counters',
    items: [
      { label: 'Bakery Counter', path: '/bakery', icon: <Storefront size={20} />, module: 'billing' },
      { label: 'Juice Counter', path: '/juice', icon: <Drop size={20} />, module: 'billing' },
    ] as NavItem[],
  },
  {
    label: 'Management',
    items: [
      { label: 'Menu', path: '/menu', icon: <ForkKnife size={20} />, module: 'menu' },
      { label: 'Inventory', path: '/inventory', icon: <Package size={20} />, module: 'inventory' },
      { label: 'Reports', path: '/reports', icon: <ChartBar size={20} />, module: 'reports' },
      { label: 'Analytics', path: '/analytics', icon: <ChartLine size={20} />, module: 'reports' },
      { label: 'Shift', path: '/shift', icon: <Timer size={20} />, module: 'all' },
    ] as NavItem[],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Staff', path: '/staff', icon: <Users size={20} />, module: 'admin' },
      { label: 'Settings', path: '/settings', icon: <Gear size={20} />, module: 'all' },
    ] as NavItem[],
  },
];

export default function Sidebar() {
  const { currentUser, logout } = useAuthStore();
  const { sidebarCollapsed, mobileSidebarOpen, setMobileSidebar, toggleSidebar } = useUIStore();

  if (!currentUser) return null;

  return (
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <ForkKnife size={20} weight="bold" color="#0c0e16" />
        </div>
        {!sidebarCollapsed && (
          <div className="sidebar-logo-text">
            <span className="brand">Railway coach </span>
            <span className="tagline">Kerala Restaurant </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(
            (item) => item.module === 'all' || hasPermission(currentUser.role, item.module)
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label} className="nav-group">
              {!sidebarCollapsed && (
                <div className="nav-group-label">{group.label}</div>
              )}
              {visibleItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileSidebar(false)}
                  end={item.path === '/'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <span className="nav-item-icon">{item.icon}</span>
                  {!sidebarCollapsed && <span>{item.label}</span>}
                  {!sidebarCollapsed && item.badge ? (
                    <span className="nav-item-badge">{item.badge}</span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="user-avatar">
            {currentUser.name.charAt(0).toUpperCase()}
          </div>
          {!sidebarCollapsed && (
            <div className="user-info">
              <div className="user-name">{currentUser.name}</div>
              <div className="user-role">{currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)}</div>
            </div>
          )}
          {!sidebarCollapsed && (
            <button
              onClick={logout}
              title="Logout"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
            >
              <SignOut size={18} />
            </button>
          )}
        </div>

        <button
          onClick={toggleSidebar}
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <CaretDoubleRight size={16} /> : <CaretDoubleLeft size={16} />}
          {!sidebarCollapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
