import React, { useState, useEffect } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { formatAmount } from '../lib/gst';
import { ChartBar, Download, Calendar, ArrowUp } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { useBillStore } from '../store/billStore';
import { Bill } from '../types';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '10px 14px' }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ fontSize: 14, fontWeight: 700, color: p.color || 'var(--accent)' }}>
            {p.name === 'revenue' ? formatAmount(p.value) : `${p.value} ${p.name}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function Reports() {
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'year'>('week');
  const { fetchBillsByDateRange, bills: localBills } = useBillStore();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBills();
  }, [dateRange]);

  const loadBills = async () => {
    setLoading(true);
    const end = new Date();
    const start = new Date();
    
    if (dateRange === 'week') {
      start.setDate(start.getDate() - 7);
    } else if (dateRange === 'month') {
      start.setMonth(start.getMonth() - 1);
    } else if (dateRange === 'year') {
      start.setFullYear(start.getFullYear() - 1);
    }
    start.setHours(0, 0, 0, 0);

    let fetchedBills: Bill[] = [];
    try {
      const supabaseBills = await fetchBillsByDateRange(start, end);
      const localFiltered = localBills.filter((b) => {
        const d = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return d >= start && d <= end;
      });
      const allById: Record<string, Bill> = {};
      localFiltered.forEach((b) => { allById[b.id] = b; });
      supabaseBills.forEach((b) => { allById[b.id] = b; });
      fetchedBills = Object.values(allById);
    } catch {
      fetchedBills = localBills.filter((b) => {
        const d = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return d >= start && d <= end;
      });
    }
    // Exclude voided bills
    setBills(fetchedBills.filter(b => b.status !== 'void'));
    setLoading(false);
  };


  // Compute metrics
  const totalRevenue = bills.reduce((s, b) => s + b.totalAmount, 0);
  const totalOrders = bills.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Group by date for Daily Data (Last 7 days logic works best for week/month, we adapt slightly)
  const dailyDataMap = new Map<string, { date: string, revenue: number, orders: number, covers: number }>();
  bills.forEach(b => {
    const dString = b.createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    if (!dailyDataMap.has(dString)) {
      dailyDataMap.set(dString, { date: dString, revenue: 0, orders: 0, covers: 0 });
    }
    const d = dailyDataMap.get(dString)!;
    d.revenue += b.totalAmount;
    d.orders += 1;
    // Covers approximation if not explicitly stored
    d.covers += b.items.reduce((sum, item) => sum + item.quantity, 0);
  });
  const DAILY_DATA = Array.from(dailyDataMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Payment Data
  const paymentMap = new Map<string, number>();
  let totalPayments = 0;
  bills.forEach(b => {
    b.payments.forEach(p => {
      const current = paymentMap.get(p.mode) || 0;
      paymentMap.set(p.mode, current + p.amount);
      totalPayments += p.amount;
    });
  });
  
  const paymentColors: Record<string, string> = {
    'cash': '#22c55e',
    'upi': '#e6a817',
    'card': '#3b82f6',
    'split': '#8b5cf6'
  };
  
  const PAYMENT_DATA = Array.from(paymentMap.entries()).map(([mode, amount]) => ({
    name: mode.charAt(0).toUpperCase() + mode.slice(1),
    value: totalPayments > 0 ? Math.round((amount / totalPayments) * 100) : 0,
    color: paymentColors[mode] || '#64748b'
  }));

  // Top Staff
  const staffMap = new Map<string, { name: string, orders: number, revenue: number, tables: Set<string> }>();
  bills.forEach(b => {
    if (!staffMap.has(b.staffName)) {
      staffMap.set(b.staffName, { name: b.staffName, orders: 0, revenue: 0, tables: new Set() });
    }
    const s = staffMap.get(b.staffName)!;
    s.orders += 1;
    s.revenue += b.totalAmount;
    if (b.tableId) s.tables.add(b.tableId);
  });
  const TOP_STAFF = Array.from(staffMap.values())
    .map(s => ({ ...s, tables: s.tables.size }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // GST Data
  const gstMap = new Map<number, { rate: number, taxable: number, cgst: number, sgst: number, total: number }>();
  bills.forEach(b => {
    if (b.gstBreakdown) {
      b.gstBreakdown.forEach(g => {
        if (!gstMap.has(g.rate)) {
          gstMap.set(g.rate, { rate: g.rate, taxable: 0, cgst: 0, sgst: 0, total: 0 });
        }
        const gm = gstMap.get(g.rate)!;
        gm.taxable += g.taxableAmount;
        gm.cgst += g.cgst;
        gm.sgst += g.sgst;
        gm.total += (g.cgst + g.sgst + g.igst);
      });
    }
  });
  
  const GST_DATA = Array.from(gstMap.values()).map(g => ({
    ...g,
    rate: `${g.rate}%`
  })).sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate));

  // Top selling dishes
  const itemMap = new Map<string, { name: string, qty: number, revenue: number }>();
  bills.forEach(b => {
    b.items?.forEach(item => {
      if (!itemMap.has(item.menuItemId)) {
        itemMap.set(item.menuItemId, { name: item.menuItemName, qty: 0, revenue: 0 });
      }
      const im = itemMap.get(item.menuItemId)!;
      im.qty += item.quantity;
      im.revenue += item.totalPrice;
    });
  });
  const TOP_DISHES = Array.from(itemMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);

  // Total covers
  const totalCovers = bills.reduce((s, b) => s + (b.guestCount || 0), 0);

  const handleExportCSV = () => {
    const lines: string[] = [];
    // Summary
    lines.push('RESTAURANT SALES REPORT');
    lines.push(`Period: ${dateRange}`);
    lines.push(`Total Revenue,${totalRevenue.toFixed(2)}`);
    lines.push(`Total Orders,${totalOrders}`);
    lines.push(`Total Covers,${totalCovers}`);
    lines.push(`Avg Order Value,${avgOrderValue.toFixed(2)}`);
    lines.push('');
    // Daily Data
    lines.push('DAILY BREAKDOWN');
    lines.push('Date,Revenue,Orders,Covers');
    DAILY_DATA.forEach(d => lines.push(`${d.date},${d.revenue.toFixed(2)},${d.orders},${d.covers}`));
    lines.push('');
    // Top Dishes
    lines.push('TOP SELLING DISHES');
    lines.push('Dish,Qty Sold,Revenue');
    TOP_DISHES.forEach(d => lines.push(`${d.name},${d.qty},${d.revenue.toFixed(2)}`));
    lines.push('');
    // GST Summary
    lines.push('GST SUMMARY');
    lines.push('Rate,Taxable Amount,CGST,SGST,Total Tax');
    GST_DATA.forEach(g => lines.push(`${g.rate},${g.taxable.toFixed(2)},${g.cgst.toFixed(2)},${g.sgst.toFixed(2)},${g.total.toFixed(2)}`));

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-report-${dateRange}-${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };


  return (
    <>
      <TopBar
        title="Reports & Analytics"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="tabs" style={{ padding: 3 }}>
              {['week', 'month', 'year'].map((r) => (
                <button key={r} className={`tab-item ${dateRange === r ? 'active' : ''}`} onClick={() => setDateRange(r as any)} style={{ padding: '6px 12px', fontSize: '0.8125rem', textTransform: 'capitalize' }}>{r}</button>
              ))}
            </div>
            <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}><Download size={16} /> Export CSV</button>

          </div>
        }
      />
      <div className="page-body">
        {loading ? (
           <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
             Loading reports...
           </div>
        ) : (
        <>
          {/* Stats */}
          <div className="grid grid-4" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
            {[
              { label: 'Total Revenue', value: formatAmount(totalRevenue), change: null, up: true },
              { label: 'Total Orders', value: totalOrders.toString(), change: null, up: true },
              { label: 'Total Covers', value: totalCovers.toString(), change: null, up: true },
              { label: 'Avg Order Value', value: formatAmount(avgOrderValue), change: null, up: true },
              { label: 'Total GST', value: formatAmount(GST_DATA.reduce((s,g) => s + g.total, 0)), change: null, up: null },
            ].map((s) => (
              <div key={s.label} className="stat-card accent">
                <div className="stat-value" style={{ fontSize: '1.5rem' }}>{s.value}</div>
                <div className="stat-label">{s.label}</div>
                {s.change && (
                  <div className={`stat-change ${s.up ? 'up' : 'down'}`}>
                    <ArrowUp size={12} style={{ display: 'inline' }} /> {s.change}
                  </div>
                )}
              </div>
            ))}
          </div>


          {/* Revenue Chart */}
          <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="card-header">
              <div className="card-title">Revenue Trend</div>
            </div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={DAILY_DATA} margin={{ top: 8, right: 8, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--accent)" fill="url(#revGrad2)" strokeWidth={2.5} dot={{ fill: 'var(--accent)', r: 4, strokeWidth: 2, stroke: 'var(--bg-card)' }} name="revenue" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-2" style={{ gap: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
            {/* Orders Bar */}
            <div className="card">
              <div className="card-header"><div className="card-title">Daily Orders</div></div>
              <div className="card-body" style={{ paddingTop: 0 }}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={DAILY_DATA} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="orders" fill="var(--status-billing)" radius={[4, 4, 0, 0]} name="orders" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Payment Mode Pie */}
            <div className="card">
              <div className="card-header"><div className="card-title">Payment Split</div></div>
              <div className="card-body" style={{ paddingTop: 0, display: 'flex', alignItems: 'center', gap: 24 }}>
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={PAYMENT_DATA} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                      {PAYMENT_DATA.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1 }}>
                  {PAYMENT_DATA.map((p) => (
                    <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.value}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* GST Summary Table */}
          <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="card-header">
              <div className="card-title">GST Summary (GSTR-1 Ready)</div>
              <button className="btn btn-secondary btn-sm"><Download size={14} /> Export</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>GST Rate</th>
                    <th>Taxable Amount</th>
                    <th>CGST</th>
                    <th>SGST</th>
                    <th style={{ textAlign: 'right' }}>Total Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {GST_DATA.map((g) => (
                    <tr key={g.rate}>
                      <td><span className="badge badge-accent">{g.rate}</span></td>
                      <td style={{ fontWeight: 600 }}>{formatAmount(g.taxable)}</td>
                      <td>{formatAmount(g.cgst)}</td>
                      <td>{formatAmount(g.sgst)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent)' }}>{formatAmount(g.total)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                    <td style={{ fontWeight: 700 }}>Total</td>
                    <td style={{ fontWeight: 700 }}>{formatAmount(GST_DATA.reduce((s,g) => s + g.taxable, 0))}</td>
                    <td style={{ fontWeight: 700 }}>{formatAmount(GST_DATA.reduce((s,g) => s + g.cgst, 0))}</td>
                    <td style={{ fontWeight: 700 }}>{formatAmount(GST_DATA.reduce((s,g) => s + g.sgst, 0))}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent)', fontSize: '1rem' }}>{formatAmount(GST_DATA.reduce((s,g) => s + g.total, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Selling Dishes */}
          <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="card-header">
              <div className="card-title">🏆 Top Selling Dishes</div>
              <span className="badge badge-accent">{TOP_DISHES.length} items</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Dish Name</th>
                    <th>Qty Sold</th>
                    <th style={{ textAlign: 'right' }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {TOP_DISHES.map((d, i) => (
                    <tr key={d.name}>
                      <td style={{ fontWeight: 700, color: i < 3 ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </td>
                      <td style={{ fontWeight: 600 }}>{d.name}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 80, height: 6, background: 'var(--border)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, (d.qty / (TOP_DISHES[0]?.qty || 1)) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 'inherit' }} />
                          </div>
                          <span style={{ fontWeight: 700 }}>{d.qty}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{formatAmount(d.revenue)}</td>
                    </tr>
                  ))}
                  {TOP_DISHES.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>No sales data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Staff Performance */}
          <div className="card">
            <div className="card-header"><div className="card-title">Staff Performance</div></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Staff Member</th>
                    <th>Orders Handled</th>
                    <th>Revenue Generated</th>
                    <th>Tables Served</th>
                  </tr>
                </thead>
                <tbody>
                  {TOP_STAFF.map((s, i) => (
                    <tr key={s.name}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: `hsl(${i * 80 + 200}, 60%, 45%)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.875rem', fontWeight: 700, color: 'white',
                          }}>
                            {s.name.charAt(0)}
                          </div>
                          <span style={{ fontWeight: 600 }}>{s.name}</span>
                        </div>
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{s.orders}</td>
                      <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{formatAmount(s.revenue)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{s.tables}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
        )}
      </div>
    </>
  );
}
