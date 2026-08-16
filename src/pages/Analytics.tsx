import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis
} from 'recharts';
import { formatAmount } from '../lib/gst';
import { ChartBar, TrendUp, Fire, Clock } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { useBillStore } from '../store/billStore';
import { useMenuStore } from '../store/menuStore';

const COLORS = ['#e6a817', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '10px 14px' }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ fontSize: 14, fontWeight: 700, color: p.color || 'var(--accent)' }}>
            {typeof p.value === 'number' && p.value > 100 ? formatAmount(p.value) : p.value} {p.name}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function Analytics() {
  const { bills } = useBillStore();
  const { categories } = useMenuStore();
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');

  // Filter bills by period
  const now = new Date();
  const startDate = new Date();
  if (period === 'today') startDate.setHours(0, 0, 0, 0);
  else if (period === 'week') { startDate.setDate(now.getDate() - 7); startDate.setHours(0, 0, 0, 0); }
  else { startDate.setMonth(now.getMonth() - 1); startDate.setHours(0, 0, 0, 0); }

  const filteredBills = bills.filter((b) => {
    const d = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
    return d >= startDate && b.status !== 'void';
  });

  // Hourly heatmap (0-23 hours)
  const hourlyMap: Record<number, { hour: number, orders: number, revenue: number }> = {};
  for (let i = 0; i < 24; i++) hourlyMap[i] = { hour: i, orders: 0, revenue: 0 };
  filteredBills.forEach((b) => {
    const h = (b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt)).getHours();
    hourlyMap[h].orders += 1;
    hourlyMap[h].revenue += b.totalAmount;
  });
  const HOURLY_DATA = Object.values(hourlyMap).map((d) => ({
    ...d,
    label: d.hour === 0 ? '12AM' : d.hour < 12 ? `${d.hour}AM` : d.hour === 12 ? '12PM' : `${d.hour - 12}PM`,
  }));

  // Category revenue breakdown
  const catRevMap: Record<string, { name: string, type: string, revenue: number, qty: number }> = {};
  filteredBills.forEach((b) => {
    b.items?.forEach((item) => {
      const key = item.menuItemId;
      // We approximate by checking item name against known items
      if (!catRevMap[key]) {
        catRevMap[key] = { name: item.menuItemName, type: 'food', revenue: 0, qty: 0 };
      }
      catRevMap[key].revenue += item.totalPrice;
      catRevMap[key].qty += item.quantity;
    });
  });

  // Category level aggregation using kotType if available
  const catTypeMap: Record<string, { name: string, revenue: number, orders: number }> = {
    food: { name: 'Food', revenue: 0, orders: 0 },
    juice: { name: 'Juice', revenue: 0, orders: 0 },
    bakery: { name: 'Bakery', revenue: 0, orders: 0 },
    other: { name: 'Other', revenue: 0, orders: 0 },
  };
  filteredBills.forEach((b) => {
    b.items?.forEach((item) => {
      const type = (item as any).kotType || 'food';
      if (!catTypeMap[type]) catTypeMap[type] = { name: type, revenue: 0, orders: 0 };
      catTypeMap[type].revenue += item.totalPrice;
      catTypeMap[type].orders += item.quantity;
    });
  });
  const CAT_DATA = Object.values(catTypeMap).filter((c) => c.revenue > 0);

  // Top 10 items
  const topItems = Object.values(catRevMap).sort((a, b) => b.qty - a.qty).slice(0, 10);

  // Daily comparison (last 7 days for week/month)
  const dayMap: Record<string, { date: string, revenue: number, orders: number }> = {};
  filteredBills.forEach((b) => {
    const d = (b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    if (!dayMap[d]) dayMap[d] = { date: d, revenue: 0, orders: 0 };
    dayMap[d].revenue += b.totalAmount;
    dayMap[d].orders += 1;
  });
  const DAILY_DATA = Object.values(dayMap);

  // Payment mode breakdown
  const payMap: Record<string, number> = {};
  filteredBills.forEach((b) => b.payments.forEach((p) => { payMap[p.mode] = (payMap[p.mode] || 0) + p.amount; }));
  const PAY_DATA = Object.entries(payMap).map(([mode, val], i) => ({ name: mode.toUpperCase(), value: val, color: COLORS[i] }));

  const totalRevenue = filteredBills.reduce((s, b) => s + b.totalAmount, 0);
  const totalOrders = filteredBills.length;
  const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const peakHour = HOURLY_DATA.reduce((a, b) => b.orders > a.orders ? b : a, HOURLY_DATA[0]);

  return (
    <>
      <TopBar
        title="Mini Analytics"
        actions={
          <div className="tabs" style={{ padding: 3 }}>
            {(['today', 'week', 'month'] as const).map((p) => (
              <button key={p} className={`tab-item ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)} style={{ padding: '6px 12px', fontSize: '0.8125rem', textTransform: 'capitalize' }}>{p}</button>
            ))}
          </div>
        }
      />
      <div className="page-body">
        {/* KPI Strip */}
        <div className="grid grid-4" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
          <div className="stat-card accent">
            <div className="stat-icon accent"><TrendUp size={22} /></div>
            <div className="stat-value">{formatAmount(totalRevenue)}</div>
            <div className="stat-label">Revenue</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon green"><ChartBar size={22} /></div>
            <div className="stat-value">{totalOrders}</div>
            <div className="stat-label">Orders</div>
          </div>
          <div className="stat-card blue">
            <div className="stat-icon blue"><TrendUp size={22} /></div>
            <div className="stat-value">{formatAmount(avgOrder)}</div>
            <div className="stat-label">Avg Order Value</div>
          </div>
          <div className="stat-card" style={{ background: 'rgba(239,68,68,0.08)' }}>
            <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}><Fire size={22} /></div>
            <div className="stat-value" style={{ color: '#ef4444' }}>{peakHour?.label || '—'}</div>
            <div className="stat-label">Peak Hour</div>
          </div>
        </div>

        {/* Hourly Heatmap */}
        <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
          <div className="card-header">
            <div className="card-title"><Clock size={18} style={{ display: 'inline', marginRight: 6 }} />Hourly Sales Pattern</div>
            <span className="badge badge-muted">Orders by hour</span>
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={HOURLY_DATA} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="orders" name="orders" radius={[3, 3, 0, 0]}>
                  {HOURLY_DATA.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.orders === peakHour?.orders && entry.orders > 0 ? '#ef4444' : entry.orders > 0 ? 'var(--accent)' : 'var(--border)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Breakdown + Payment Split */}
        <div className="grid grid-2" style={{ gap: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
          <div className="card">
            <div className="card-header"><div className="card-title">Revenue by Category</div></div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              {CAT_DATA.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={CAT_DATA} dataKey="revenue" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                        {CAT_DATA.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1 }}>
                    {CAT_DATA.map((c, i) => (
                      <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                        <div style={{ flex: 1, fontSize: '0.875rem', fontWeight: 600, textTransform: 'capitalize' }}>{c.name}</div>
                        <div style={{ fontWeight: 800, fontSize: '0.875rem', color: COLORS[i % COLORS.length] }}>{formatAmount(c.revenue)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No sales yet</div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">Payment Mode Split</div></div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              {PAY_DATA.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={PAY_DATA} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                        {PAY_DATA.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1 }}>
                    {PAY_DATA.map((p) => (
                      <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, fontSize: '0.875rem', fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontWeight: 800, color: p.color }}>{formatAmount(p.value)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No payments yet</div>
              )}
            </div>
          </div>
        </div>

        {/* Top 10 Items */}
        <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
          <div className="card-header">
            <div className="card-title">🔥 Top 10 Items by Quantity</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th>Qty Sold</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((item, i) => (
                  <tr key={item.name}>
                    <td style={{ fontWeight: 700, color: i < 3 ? 'var(--accent)' : 'var(--text-muted)' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </td>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 100, height: 6, background: 'var(--border)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, (item.qty / (topItems[0]?.qty || 1)) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 'inherit' }} />
                        </div>
                        <span style={{ fontWeight: 700 }}>{item.qty}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{formatAmount(item.revenue)}</td>
                  </tr>
                ))}
                {topItems.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>No sales data for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Daily Revenue Trend */}
        {DAILY_DATA.length > 1 && (
          <div className="card">
            <div className="card-header"><div className="card-title">Revenue Trend</div></div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={DAILY_DATA} margin={{ top: 8, right: 8, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="analyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="revenue" name="revenue" stroke="var(--accent)" fill="url(#analyGrad)" strokeWidth={2.5} dot={{ fill: 'var(--accent)', r: 4, strokeWidth: 2, stroke: 'var(--bg-card)' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
