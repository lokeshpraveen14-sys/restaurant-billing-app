import React, { useState } from 'react';
import { useShiftStore } from '../store/shiftStore';
import { useAuthStore } from '../store/authStore';
import { useBillStore } from '../store/billStore';
import { useToast } from '../store/uiStore';
import { formatAmount } from '../lib/gst';
import {
  Timer, CheckCircle, CurrencyInr, Receipt, Users,
  Printer, Lock, LockOpen, Clock
} from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { useReactToPrint } from 'react-to-print';

export default function ShiftManagement() {
  const { currentShift, shifts, openShift, closeShift } = useShiftStore();
  const { currentUser } = useAuthStore();
  const { bills } = useBillStore();
  const toast = useToast();
  const [openingBalance, setOpeningBalance] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const printRef = React.useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ content: () => printRef.current });

  // Today's bills for current shift
  const shiftBills = currentShift
    ? bills.filter((b) => b.createdAt >= currentShift.openedAt && b.status !== 'void')
    : [];

  const shiftCash = shiftBills.reduce(
    (s, b) => s + b.payments.filter((p) => p.mode === 'cash').reduce((a, p) => a + p.amount, 0),
    0
  );
  const shiftUPI = shiftBills.reduce(
    (s, b) => s + b.payments.filter((p) => p.mode === 'upi').reduce((a, p) => a + p.amount, 0),
    0
  );
  const shiftCard = shiftBills.reduce(
    (s, b) => s + b.payments.filter((p) => p.mode === 'card').reduce((a, p) => a + p.amount, 0),
    0
  );
  const shiftRevenue = shiftBills.reduce((s, b) => s + b.totalAmount, 0);
  const shiftCovers = shiftBills.reduce((s, b) => s + (b.guestCount || 0), 0);
  const closingBalance = (currentShift?.openingBalance || 0) + shiftCash;

  const formatDuration = (start: Date, end?: Date) => {
    const diff = ((end || new Date()).getTime() - start.getTime()) / 1000;
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const handleOpenShift = () => {
    if (!currentUser) return;
    const balance = parseFloat(openingBalance) || 0;
    openShift(currentUser.name, currentUser.id, balance);
    setOpeningBalance('');
    setShowOpenModal(false);
    toast.success('Shift Opened', `Shift started with ₹${balance} opening balance`);
  };

  const handleCloseShift = () => {
    closeShift(closeNotes);
    setCloseNotes('');
    setShowCloseModal(false);
    toast.success('Shift Closed', 'Shift summary saved successfully');
  };

  return (
    <>
      <TopBar
        title="Shift Management"
        actions={
          currentShift ? (
            <button className="btn btn-secondary btn-sm" style={{ color: 'var(--status-occupied)' }} onClick={() => setShowCloseModal(true)}>
              <Lock size={16} /> Close Shift
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => setShowOpenModal(true)}>
              <LockOpen size={16} /> Open Shift
            </button>
          )
        }
      />
      <div className="page-body">

        {/* Current Shift Status */}
        {currentShift ? (
          <>
            {/* Live Shift Banner */}
            <div style={{
              background: 'linear-gradient(135deg, var(--accent-dim), transparent)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-5)',
              marginBottom: 'var(--space-5)',
              display: 'flex', alignItems: 'center', gap: 16
            }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Timer size={24} color="#0c0e16" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>Shift Active — {currentShift.staffName}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  Started: {new Date(currentShift.openedAt).toLocaleString('en-IN')} · Duration: {formatDuration(new Date(currentShift.openedAt))}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Opening Balance</div>
                <div style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--accent)' }}>{formatAmount(currentShift.openingBalance)}</div>
              </div>
            </div>

            {/* Live Stats */}
            <div className="grid grid-4" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
              <div className="stat-card accent">
                <div className="stat-icon accent"><CurrencyInr size={22} /></div>
                <div className="stat-value">{formatAmount(shiftRevenue)}</div>
                <div className="stat-label">Shift Revenue</div>
              </div>
              <div className="stat-card green">
                <div className="stat-icon green"><Receipt size={22} /></div>
                <div className="stat-value">{shiftBills.length}</div>
                <div className="stat-label">Orders This Shift</div>
              </div>
              <div className="stat-card blue">
                <div className="stat-icon blue"><Users size={22} /></div>
                <div className="stat-value">{shiftCovers}</div>
                <div className="stat-label">Covers</div>
              </div>
              <div className="stat-card" style={{ background: 'rgba(16,185,129,0.08)' }}>
                <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}><Clock size={22} /></div>
                <div className="stat-value" style={{ color: '#10b981' }}>{closingBalance > 0 ? formatAmount(closingBalance) : '—'}</div>
                <div className="stat-label">Expected Closing Cash</div>
              </div>
            </div>

            {/* Payment Breakdown */}
            <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
              <div className="card-header"><div className="card-title">Payment Mode Breakdown</div></div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)' }}>
                  {[
                    { label: 'Cash', amount: shiftCash, color: '#22c55e', icon: '💵' },
                    { label: 'UPI', amount: shiftUPI, color: '#f59e0b', icon: '📱' },
                    { label: 'Card', amount: shiftCard, color: '#3b82f6', icon: '💳' },
                  ].map((p) => (
                    <div key={p.label} style={{ padding: 'var(--space-4)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{p.icon}</div>
                      <div style={{ fontWeight: 800, fontSize: '1.25rem', color: p.color }}>{formatAmount(p.amount)}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{p.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent bills in shift */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Bills This Shift</div>
                <button className="btn btn-secondary btn-sm" onClick={handlePrint}>
                  <Printer size={14} /> Print Summary
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Time</th>
                      <th>Table/Type</th>
                      <th>Payment</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shiftBills.slice().reverse().map((bill) => (
                      <tr key={bill.id}>
                        <td style={{ fontWeight: 600 }}>{bill.invoiceNumber}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                          {bill.createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td>{bill.tableNumber ? `T${bill.tableNumber}` : bill.orderType}</td>
                        <td>
                          {bill.payments.map((p, i) => (
                            <span key={i} className="badge badge-muted" style={{ marginRight: 4, textTransform: 'capitalize' }}>{p.mode}</span>
                          ))}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatAmount(bill.totalAmount)}</td>
                      </tr>
                    ))}
                    {shiftBills.length === 0 && (
                      <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>No bills yet in this shift</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-12)' }}>
            <div className="empty-state-icon" style={{ width: 80, height: 80 }}><Timer size={40} /></div>
            <div className="empty-state-title">No Active Shift</div>
            <div className="empty-state-desc">Open a shift to start tracking sales and cash for this session</div>
            <button className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }} onClick={() => setShowOpenModal(true)}>
              <LockOpen size={18} /> Open New Shift
            </button>
          </div>
        )}

        {/* Previous Shifts */}
        {shifts.length > 0 && (
          <div className="card" style={{ marginTop: 'var(--space-5)' }}>
            <div className="card-header"><div className="card-title">Shift History</div></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Opened</th>
                    <th>Closed</th>
                    <th>Duration</th>
                    <th>Orders</th>
                    <th>Cash</th>
                    <th>UPI</th>
                    <th>Card</th>
                    <th style={{ textAlign: 'right' }}>Total Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((rawShift) => {
                    const s = { 
                      ...rawShift, 
                      openedAt: new Date(rawShift.openedAt), 
                      closedAt: rawShift.closedAt ? new Date(rawShift.closedAt) : undefined 
                    };
                    return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{s.staffName}</td>
                      <td style={{ fontSize: '0.875rem' }}>{s.openedAt.toLocaleString('en-IN')}</td>
                      <td style={{ fontSize: '0.875rem' }}>{s.closedAt ? s.closedAt.toLocaleString('en-IN') : '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{formatDuration(s.openedAt, s.closedAt)}</td>
                      <td>{s.totalOrders}</td>
                      <td style={{ color: '#22c55e', fontWeight: 600 }}>{formatAmount(s.totalCash)}</td>
                      <td style={{ color: '#f59e0b', fontWeight: 600 }}>{formatAmount(s.totalUPI)}</td>
                      <td style={{ color: '#3b82f6', fontWeight: 600 }}>{formatAmount(s.totalCard)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent)' }}>{formatAmount(s.totalRevenue)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Open Shift Modal */}
      {showOpenModal && (
        <div className="modal-overlay" onClick={() => setShowOpenModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title"><LockOpen size={18} style={{ display: 'inline', marginRight: 8 }} />Open New Shift</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowOpenModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 8, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Staff: <strong>{currentUser?.name}</strong>
              </div>
              <div className="input-group">
                <label className="input-label">Opening Cash Balance (₹)</label>
                <input
                  className="input"
                  type="number"
                  placeholder="e.g., 500"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowOpenModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleOpenShift}>Open Shift</button>
            </div>
          </div>
        </div>
      )}

      {/* Close Shift Modal */}
      {showCloseModal && (
        <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <span className="modal-title"><Lock size={18} style={{ display: 'inline', marginRight: 8 }} />Close Shift</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowCloseModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {/* Summary */}
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Shift Summary</div>
                {[
                  ['Staff', currentShift?.staffName || ''],
                  ['Duration', currentShift ? formatDuration(new Date(currentShift.openedAt)) : ''],
                  ['Orders', shiftBills.length.toString()],
                  ['Covers', shiftCovers.toString()],
                  ['Opening Balance', formatAmount(currentShift?.openingBalance || 0)],
                  ['Cash Collected', formatAmount(shiftCash)],
                  ['UPI Collected', formatAmount(shiftUPI)],
                  ['Card Collected', formatAmount(shiftCard)],
                  ['Total Revenue', formatAmount(shiftRevenue)],
                  ['Expected Closing Cash', formatAmount(closingBalance)],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.875rem', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                    <span style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="input-group">
                <label className="input-label">Notes (optional)</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Any handover notes..."
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCloseModal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: 'var(--status-occupied)' }} onClick={handleCloseShift}>
                <CheckCircle size={16} /> Confirm Close Shift
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Summary (hidden) */}
      <div style={{ display: 'none' }}>
        <div ref={printRef} className="bill-print">
          <div className="bill-center bill-bold" style={{ fontSize: 14 }}>SHIFT CLOSING REPORT</div>
          <div className="bill-center" style={{ fontSize: 10 }}>{currentShift?.staffName || ''}</div>
          <div className="bill-hr" />
          {[
            ['Shift Start', currentShift ? new Date(currentShift.openedAt).toLocaleString('en-IN') : ''],
            ['Total Orders', shiftBills.length.toString()],
            ['Total Covers', shiftCovers.toString()],
            ['Opening Balance', `₹${(currentShift?.openingBalance || 0).toFixed(2)}`],
            ['Cash Collected', `₹${shiftCash.toFixed(2)}`],
            ['UPI Collected', `₹${shiftUPI.toFixed(2)}`],
            ['Card Collected', `₹${shiftCard.toFixed(2)}`],
            ['Total Revenue', `₹${shiftRevenue.toFixed(2)}`],
            ['Closing Cash Balance', `₹${closingBalance.toFixed(2)}`],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
              <span>{k}</span><span style={{ fontWeight: 'bold' }}>{v}</span>
            </div>
          ))}
          <div className="bill-hr" />
          <div className="bill-center" style={{ fontSize: 9 }}>Printed: {new Date().toLocaleString('en-IN')}</div>
        </div>
      </div>
    </>
  );
}
