import React from 'react';
import { useOrderStore } from '../store/orderStore';
import { useBillStore } from '../store/billStore';
import { useTableStore } from '../store/tableStore';
import { useShiftStore } from '../store/shiftStore';
import { formatAmount } from '../lib/gst';
import {
  Users, Table, ShoppingBag, Drop, CheckCircle, Clock, Storefront,
} from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';

export default function HeadCount() {
  const { orders } = useOrderStore();
  const { bills } = useBillStore();
  const { tables } = useTableStore();
  const { currentShift } = useShiftStore();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const filterStartTime = currentShift ? new Date(currentShift.openedAt) : startOfToday;

  // ── Active dine-in orders (tables currently occupied) ────────
  const activeDineInOrders = orders.filter(
    (o) =>
      ['open', 'kot_sent', 'preparing', 'ready', 'billed'].includes(o.status) &&
      o.orderType === 'dine-in'
  );

  // guestCount entered when table was opened; fallback 1 per order if not set
  const activeDineInPax = activeDineInOrders.reduce(
    (s, o) => s + (o.guestCount && o.guestCount > 0 ? o.guestCount : 1),
    0
  );

  // ── Today's completed bills ───────────────────────────────────
  const todayBills = bills.filter(
    (b) => new Date(b.createdAt) >= filterStartTime && b.status !== 'void'
  );

  const billsDineIn = todayBills.filter((b) => b.orderType === 'dine-in');
  const billsTakeaway = todayBills.filter((b) => b.orderType === 'takeaway');
  const billsCounter = todayBills.filter((b) => b.orderType === 'counter');

  // Dine-in covers from completed bills (guestCount or 1)
  const completedDineInPax = billsDineIn.reduce(
    (s, b) => s + (b.guestCount && b.guestCount > 0 ? b.guestCount : 1),
    0
  );

  // ── Total live count (user's formula) ────────────────────────
  // Active dine-in pax  +  each takeaway today = 1  +  each counter bill today = 1
  const liveTotalCount =
    activeDineInPax + billsTakeaway.length + billsCounter.length;

  // Total covers (all dine-in including completed + takeaway + counter)
  const totalCoversToday =
    (activeDineInPax + completedDineInPax) + billsTakeaway.length + billsCounter.length;

  const totalRevenue = todayBills.reduce((s, b) => s + b.totalAmount, 0);
  const avgSpendPerHead = totalCoversToday > 0 ? totalRevenue / totalCoversToday : 0;

  function elapsedStr(since: Date) {
    const mins = Math.floor((Date.now() - new Date(since).getTime()) / 60000);
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  const tableInfoMap = tables.reduce<Record<string, string>>((acc, t) => {
    acc[t.id] = t.number;
    return acc;
  }, {});

  return (
    <>
      <TopBar title="Head Count" />
      <div className="page-body">

        {/* Live Count Hero */}
        <div
          style={{
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
            borderRadius: 'var(--radius-xl)',
            padding: '24px 28px',
            marginBottom: 'var(--space-5)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '0.8125rem', opacity: 0.85, fontWeight: 500, marginBottom: 4 }}>
              <Clock size={13} style={{ display: 'inline', marginRight: 4 }} />
              LIVE COUNT RIGHT NOW
            </div>
            <div style={{ fontSize: '3.5rem', fontWeight: 900, lineHeight: 1 }}>
              {liveTotalCount}
            </div>
            <div style={{ fontSize: '0.8125rem', opacity: 0.75, marginTop: 6 }}>
              {activeDineInPax} dine-in
              {billsTakeaway.length > 0 ? ` · ${billsTakeaway.length} takeaway` : ''}
              {billsCounter.length > 0 ? ` · ${billsCounter.length} counter` : ''}
            </div>
          </div>
          <div style={{ opacity: 0.25 }}>
            <Users size={80} weight="fill" />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-4" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
          <div className="stat-card accent">
            <div className="stat-icon accent"><Users size={22} /></div>
            <div className="stat-value">{totalCoversToday}</div>
            <div className="stat-label">Total Covers Today</div>
            <div className="stat-change up">All types combined</div>
          </div>

          <div className="stat-card green">
            <div className="stat-icon green"><Table size={22} /></div>
            <div className="stat-value">{activeDineInPax}</div>
            <div className="stat-label">Guests Dining Now</div>
            <div className="stat-change up" style={{ color: 'var(--status-free)' }}>
              {activeDineInOrders.length} table{activeDineInOrders.length !== 1 ? 's' : ''} open
            </div>
          </div>

          <div className="stat-card blue">
            <div className="stat-icon blue"><CheckCircle size={22} /></div>
            <div className="stat-value">{todayBills.length}</div>
            <div className="stat-label">Bills Today</div>
            <div className="stat-change">
              DI: {billsDineIn.length} · TW: {billsTakeaway.length} · CTR: {billsCounter.length}
            </div>
          </div>

          <div className="stat-card red">
            <div className="stat-icon red"><Users size={22} /></div>
            <div className="stat-value">{formatAmount(avgSpendPerHead)}</div>
            <div className="stat-label">Avg / Head</div>
            <div className="stat-change down" style={{ color: 'var(--accent)' }}>
              {formatAmount(totalRevenue)} total
            </div>
          </div>
        </div>

        <div className="grid grid-2" style={{ gap: 'var(--space-5)', alignItems: 'start' }}>

          {/* Live Table Seating */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <Table size={16} style={{ display: 'inline', marginRight: 6 }} />
                Live Table Seating
              </div>
              <span className="badge badge-accent">
                <Clock size={11} style={{ display: 'inline', marginRight: 3 }} />
                Live
              </span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {activeDineInOrders.length === 0 ? (
                <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
                  <div className="empty-state-icon" style={{ width: 48, height: 48 }}>
                    <Table size={24} />
                  </div>
                  <div className="empty-state-title">No active tables</div>
                  <div className="empty-state-desc">Open a table to see guests here</div>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Table</th>
                      <th>Guests</th>
                      <th>Waiter</th>
                      <th>Time</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDineInOrders.map((order, i) => (
                      <tr key={i}>
                        <td>
                          <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                            Table {order.tableNumber || tableInfoMap[order.tableId || ''] || '?'}
                          </span>
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, fontSize: '1rem' }}>
                            <Users size={14} />
                            {order.guestCount && order.guestCount > 0 ? order.guestCount : 1}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                          {order.staffName}
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                          {elapsedStr(new Date(order.createdAt))}
                        </td>
                        <td>
                          <span className={`badge ${order.status === 'billed' ? 'badge-billing'
                              : order.status === 'kot_sent' || order.status === 'preparing' ? 'badge-accent'
                                : 'badge-success'
                            }`}>
                            {order.status === 'kot_sent' ? 'KOT Sent'
                              : order.status === 'preparing' ? 'Preparing'
                                : order.status === 'billed' ? 'Billed' : 'Open'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ fontWeight: 700 }}>Total</td>
                      <td style={{ fontWeight: 700, color: 'var(--accent)' }}>
                        <Users size={13} style={{ display: 'inline', marginRight: 4 }} />
                        {activeDineInPax}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>

          {/* Breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

            <div className="card">
              <div className="card-header">
                <div className="card-title">Today's Footfall</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {currentShift ? 'Since shift opened' : 'Since midnight'}
                </span>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

                {/* Dine-In Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                      <Table size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>Dine-In</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {activeDineInOrders.length} active · {billsDineIn.length} billed
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: '1.5rem' }}>{activeDineInPax + completedDineInPax}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>guests</div>
                  </div>
                </div>

                {/* Takeaway Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'rgba(249,115,22,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f97316' }}>
                      <ShoppingBag size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>Takeaway</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Each order = 1 person</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: '1.5rem' }}>{billsTakeaway.length}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>orders</div>
                  </div>
                </div>

                {/* Counter Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'rgba(6,182,212,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#06b6d4' }}>
                      <Drop size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>Bakery / Juice Counter</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Each bill = 1 transaction</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: '1.5rem' }}>{billsCounter.length}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>bills</div>
                  </div>
                </div>

                {/* Grand Total row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--accent-dim)', borderRadius: 'var(--radius-md)', border: '1px solid var(--accent)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                      <Users size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--accent)' }}>Total Live Count</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Table pax + takeaway + counter
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 900, fontSize: '2rem', color: 'var(--accent)' }}>{liveTotalCount}</div>
                  </div>
                </div>

              </div>
            </div>

            {currentShift && (
              <div className="card" style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)' }}>
                <div className="card-body" style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.875rem' }}>Current Shift</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        Since {new Date(currentShift.openedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: '1.5rem' }}>{totalCoversToday}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>covers this shift</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
