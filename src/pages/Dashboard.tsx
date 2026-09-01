import React from 'react';
import { useAuthStore } from '../store/authStore';
import { useTableStore } from '../store/tableStore';
import { useOrderStore } from '../store/orderStore';
import { useMenuStore } from '../store/menuStore';
import { useBillStore } from '../store/billStore';
import { useShiftStore } from '../store/shiftStore';
import { formatAmount } from '../lib/gst';
import {
  TrendUp, Receipt, Table, ClipboardText, CurrencyInr,
  ChartBar, ArrowUp, ArrowDown, Clock, CheckCircle
} from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// We will compute SALES_DATA and TOP_ITEMS dynamically now.

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '10px 14px' }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ fontSize: 14, fontWeight: 700, color: p.color }}>
            {p.name === 'revenue' ? formatAmount(p.value) : `${p.value} orders`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const { currentUser } = useAuthStore();
  const { tables } = useTableStore();
  const { orders } = useOrderStore();
  const { items } = useMenuStore();
  const { bills } = useBillStore();
  const { currentShift } = useShiftStore();

  const occupiedTables = tables.filter((t) => t.status === 'occupied').length;
  const freeTables = tables.filter((t) => t.status === 'free').length;
  const activeOrders = orders.filter((o) => ['kot_sent', 'preparing'].includes(o.status)).length;
  
  // Calculate daily totals from midnight, regardless of shifts
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  
  const todayBills = bills.filter(b => new Date(b.createdAt) >= startOfToday && b.status !== 'void');
  const todayRevenue = todayBills.reduce((sum, bill) => sum + bill.totalAmount, 0);
  
  const activeCovers = orders
    .filter(o => new Date(o.createdAt) >= startOfToday && ['open', 'kot_sent', 'preparing', 'ready', 'billed'].includes(o.status))
    .reduce((sum, order) => sum + (order.guestCount || 0), 0);
    
  const todayCovers = todayBills.reduce((sum, bill) => sum + (bill.guestCount || 0), 0) + activeCovers;

  // Calculate top items dynamically from bills
  const itemStats: Record<string, { name: string, orders: number, revenue: number }> = {};
  bills.forEach(bill => {
    if (bill.items) {
      bill.items.forEach(item => {
        if (!itemStats[item.menuItemId]) {
          itemStats[item.menuItemId] = { name: item.menuItemName, orders: 0, revenue: 0 };
        }
        itemStats[item.menuItemId].orders += item.quantity;
        itemStats[item.menuItemId].revenue += item.totalPrice;
      });
    }
  });
  
  const TOP_ITEMS = Object.values(itemStats)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const itemStatsToday: Record<string, { name: string, orders: number, revenue: number }> = {};
  todayBills.forEach(bill => {
    if (bill.items) {
      bill.items.forEach(item => {
        if (!itemStatsToday[item.menuItemId]) {
          itemStatsToday[item.menuItemId] = { name: item.menuItemName, orders: 0, revenue: 0 };
        }
        itemStatsToday[item.menuItemId].orders += item.quantity;
        itemStatsToday[item.menuItemId].revenue += item.totalPrice;
      });
    }
  });

  const TOP_ITEMS_TODAY = Object.values(itemStatsToday)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Fallback if no sales yet today
  const topItemsDisplay = TOP_ITEMS_TODAY.length > 0 ? TOP_ITEMS_TODAY : [
    { name: 'No sales yet today', orders: 0, revenue: 0 }
  ];

  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    last7Days.push(d);
  }
  
  const SALES_DATA = last7Days.map(date => {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    
    const dayBills = bills.filter(b => {
      const d = new Date(b.createdAt);
      return d >= date && d < nextDate && b.status !== 'void';
    });
    
    return {
      day: date.toDateString() === startOfToday.toDateString() ? 'Today' : date.toLocaleDateString('en-IN', { weekday: 'short' }),
      revenue: dayBills.reduce((s, b) => s + b.totalAmount, 0),
      orders: dayBills.length
    };
  });

  return (
    <>
      <TopBar title="Dashboard" />
      <div className="page-body">
        {/* Greeting */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h2 style={{ color: 'var(--text-primary)', marginBottom: 4 }}>
            Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, {currentUser?.name.split(' ')[0]}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-4" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
          <div className="stat-card accent">
            <div className="stat-icon accent">
              <CurrencyInr size={22} />
            </div>
            <div className="stat-value">{formatAmount(todayRevenue)}</div>
            <div className="stat-label">Today's Revenue</div>
            <div className="stat-change up">
              <ArrowUp size={12} style={{ display: 'inline' }} /> 12.4% vs yesterday
            </div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon green">
              <Table size={22} />
            </div>
            <div className="stat-value">{occupiedTables}/{tables.length}</div>
            <div className="stat-label">Tables Occupied</div>
            <div className="stat-change up" style={{ color: 'var(--status-billing)' }}>
              {freeTables} free now
            </div>
          </div>
          <div className="stat-card blue">
            <div className="stat-icon blue">
              <ClipboardText size={22} />
            </div>
            <div className="stat-value">{activeOrders}</div>
            <div className="stat-label">Active Orders</div>
            <div className="stat-change">
              <Clock size={12} style={{ display: 'inline', color: 'var(--text-muted)' }} /> In kitchen
            </div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon red">
              <Receipt size={22} />
            </div>
            <div className="stat-value">
              {todayCovers > 0 ? todayCovers : '0'}
            </div>
            <div className="stat-label">Covers Today</div>
            <div className="stat-change down" style={{ color: 'var(--status-billing)' }}>
              <TrendUp size={12} style={{ display: 'inline' }} /> Live from today's bills
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-2" style={{ gap: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
          {/* Revenue Chart */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Weekly Revenue</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Last 7 days</div>
              </div>
              <span className="badge badge-accent">
                Today Live
              </span>
            </div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={SALES_DATA} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--accent)" fill="url(#revGradient)" strokeWidth={2.5} dot={{ fill: 'var(--accent)', r: 4, strokeWidth: 2, stroke: 'var(--bg-card)' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Items */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Top Selling Items</div>
              <span className="text-sm text-muted">Today</span>
            </div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topItemsDisplay} layout="vertical" margin={{ top: 0, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="orders" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-2" style={{ gap: 'var(--space-5)' }}>
          {/* Table Status */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Table Status</div>
            </div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              {(['free', 'occupied', 'reserved', 'billing', 'cleaning'] as const).map((status) => {
                const count = tables.filter((t) => t.status === status).length;
                const pct = Math.round((count / tables.length) * 100);
                const colors = {
                  free: 'var(--status-free)',
                  occupied: 'var(--status-occupied)',
                  reserved: 'var(--status-reserved)',
                  billing: 'var(--status-billing)',
                  cleaning: 'var(--status-cleaning)',
                };
                return (
                  <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors[status], flexShrink: 0 }} />
                    <span style={{ textTransform: 'capitalize', fontSize: '0.875rem', color: 'var(--text-secondary)', flex: 1 }}>{status}</span>
                    <div style={{ width: 120, height: 6, background: 'var(--border)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: colors[status], borderRadius: 'inherit', transition: 'width 0.5s ease' }} />
                    </div>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', width: 24, textAlign: 'right' }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Recent Orders</div>
            </div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              {bills.slice(-5).reverse().map((bill) => (
                <div key={bill.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>{bill.invoiceNumber}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{bill.tableNumber || 'Takeaway'} &bull; {bill.items.length} items</div>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'var(--text-primary)' }}>{formatAmount(bill.totalAmount)}</div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                      {new Date(bill.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <span className="badge badge-free" style={{ fontSize: '0.625rem' }}>paid</span>
                </div>
              ))}
              {bills.length === 0 && (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)' }}>No recent orders</div>
              )}
            </div>
          </div>
        </div>

        {/* Reservations Row */}
        <div className="grid grid-2" style={{ gap: 'var(--space-5)', marginTop: 'var(--space-5)' }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Today's Reservations</div>
              <span className="badge badge-reserved">{tables.filter(t => t.status === 'reserved').length}</span>
            </div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              {tables.filter(t => t.status === 'reserved').length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)' }}>No reservations today</div>
              ) : (
                tables.filter(t => t.status === 'reserved').map(table => (
                  <div key={table.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 'var(--radius-md)',
                      background: 'var(--status-reserved-bg)', color: 'var(--status-reserved)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800
                    }}>
                      {table.number}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>{table.reservedFor}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{table.capacity} Seats &bull; {table.section}</div>
                    </div>
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }}>
                      Seat Guests
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
