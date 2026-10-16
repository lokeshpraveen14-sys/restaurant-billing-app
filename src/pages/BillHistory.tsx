import React, { useState, useEffect, useMemo } from 'react';
import { useBillStore } from '../store/billStore';
import { useShiftStore } from '../store/shiftStore';
import { useSettingsStore } from '../store/settingsStore';
import { useToast } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { Bill } from '../types';
import { formatAmount } from '../lib/gst';
import { printReceipt, buildBillReceipt } from '../lib/printer';
import {
  Receipt,
  Eye,
  XCircle,
  Calendar,
  WarningCircle,
  Printer,
  PencilSimple,
  CaretLeft,
  CaretRight,
  ArrowsClockwise,
  Trash,
} from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { useNavigate } from 'react-router-dom';
import { useOrderStore } from '../store/orderStore';
import { useTableStore } from '../store/tableStore';

export default function BillHistory() {
  const fetchBillsByDateRange = useBillStore((s) => s.fetchBillsByDateRange);
  const voidBill = useBillStore((s) => s.voidBill);
  const reviseBill = useBillStore((s) => s.reviseBill);
  const localBills = useBillStore((s) => s.bills);
  const settings = useSettingsStore((s) => s.settings);
  const recreateOrderWithItems = useOrderStore((s) => s.recreateOrderWithItems);
  const updateTableStatus = useTableStore((s) => s.updateTableStatus);
  const getActiveShiftForStaff = useShiftStore((s) => s.getActiveShiftForStaff);
  const currentUser = useAuthStore((s) => s.currentUser);
  const toast = useToast();
  const navigate = useNavigate();

  const [historyTab, setHistoryTab] = useState<'all' | 'deleted' | 'revised'>('all');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalBills, setTotalBills] = useState(0);

  // Void modal state
  const [voidModal, setVoidModal] = useState<{ billId: string; invoiceNumber: string } | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Revise modal state
  const [reviseModal, setReviseModal] = useState<Bill | null>(null);
  const [reviseReason, setReviseReason] = useState('');

  const itemsPerPage = 50;

  const invoiceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    bills.forEach((b) => {
      counts[b.invoiceNumber] = (counts[b.invoiceNumber] || 0) + 1;
    });
    return counts;
  }, [bills]);

  // Derived filtered bills based on history tab
  const displayedBills = useMemo(() => {
    if (historyTab === 'deleted') {
      return bills.filter((b) => b.status === 'void');
    }
    if (historyTab === 'revised') {
      return bills.filter((b) => b.status === 'revised');
    }
    return bills;
  }, [bills, historyTab]);

  const deletedCount = useMemo(() => bills.filter((b) => b.status === 'void').length, [bills]);
  const deletedAmount = useMemo(
    () => bills.filter((b) => b.status === 'void').reduce((s, b) => s + b.totalAmount, 0),
    [bills]
  );
  const revisedCount = useMemo(() => bills.filter((b) => b.status === 'revised').length, [bills]);
  const revisedAmount = useMemo(
    () => bills.filter((b) => b.status === 'revised').reduce((s, b) => s + b.totalAmount, 0),
    [bills]
  );
  const paidCount = useMemo(
    () => bills.filter((b) => b.status === 'paid' || !b.status).length,
    [bills]
  );

  useEffect(() => {
    let isMounted = true;
    const loadBills = async () => {
      setLoading(true);
      const end = new Date();
      const start = new Date();

      if (dateRange === 'today') {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
      } else if (dateRange === 'week') {
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
      } else if (dateRange === 'month') {
        start.setMonth(start.getMonth() - 1);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
      } else if (dateRange === 'custom') {
        const s = new Date(customStart);
        s.setHours(0, 0, 0, 0);
        const e = new Date(customEnd);
        e.setHours(23, 59, 59, 999);
        start.setTime(s.getTime());
        end.setTime(e.getTime());
      }

      try {
        const result = await fetchBillsByDateRange(start, end, 1, itemsPerPage);
        if (!isMounted) return;
        setBills(result.bills);
        setTotalBills(result.total);
      } catch (err) {
        if (!isMounted) return;
        const localFiltered = localBills
          .filter((b) => {
            const d = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
            return d >= start && d <= end;
          })
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setBills(localFiltered);
        setTotalBills(localFiltered.length);
      }
      setCurrentPage(1);
      setLoading(false);
    };

    if (dateRange !== 'custom') loadBills();
    return () => {
      isMounted = false;
    };
  }, [dateRange]);

  const loadBillsManual = async (page = 1) => {
    setLoading(true);
    const end = new Date();
    const start = new Date();

    if (dateRange === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (dateRange === 'week') {
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (dateRange === 'month') {
      start.setMonth(start.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (dateRange === 'custom') {
      const s = new Date(customStart);
      s.setHours(0, 0, 0, 0);
      const e = new Date(customEnd);
      e.setHours(23, 59, 59, 999);
      start.setTime(s.getTime());
      end.setTime(e.getTime());
    }

    try {
      const result = await fetchBillsByDateRange(start, end, page, itemsPerPage);
      setBills(result.bills);
      setTotalBills(result.total);
      setCurrentPage(page);
    } catch (err) {
      const localFiltered = localBills
        .filter((b) => {
          const d = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
          return d >= start && d <= end;
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setBills(localFiltered);
      setTotalBills(localFiltered.length);
      setCurrentPage(1);
    }
    setLoading(false);
  };

  const handleVoidBill = async () => {
    if (!voidModal) return;
    const voidedBy = currentUser?.name || 'Unknown';
    const activeShift = getActiveShiftForStaff(currentUser?.id);
    await voidBill(voidModal.billId, voidedBy, voidReason, activeShift?.id);
    toast.success('Bill Voided', `Bill ${voidModal.invoiceNumber} voided by ${voidedBy}`);
    setVoidModal(null);
    setVoidReason('');
    setSelectedBill(null);
    loadBillsManual(currentPage);
  };

  const handleReviseBill = async () => {
    if (!reviseModal) return;
    const bill = reviseModal;
    const revisedBy = currentUser?.name || 'Unknown';
    const activeShift = getActiveShiftForStaff(currentUser?.id);

    // 1. Mark bill as revised with audit trail
    await reviseBill(bill.id, revisedBy, reviseReason || 'Bill revised', activeShift?.id);

    // 2. Map items for re-creation
    const mappedItems = bill.items.map((item) => ({
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      unitPrice: item.unitPrice || 0,
      quantity: item.quantity,
      totalPrice: item.totalPrice,
      variantName: item.variantName,
      addons: item.addons || [],
      isVeg: item.isVeg ?? true,
      gstRate: item.gstRate || 0,
    }));

    // 3. Re-create order with items
    const newOrder = recreateOrderWithItems(
      bill.tableId,
      bill.tableNumber,
      bill.orderType,
      currentUser?.id || 'staff-id-revised',
      currentUser?.name || bill.staffName,
      bill.guestCount,
      mappedItems
    );

    // 4. Update table status if dine-in
    if (bill.tableId && bill.orderType === 'dine-in') {
      updateTableStatus(bill.tableId, 'occupied');
    }

    setReviseModal(null);
    setReviseReason('');
    setSelectedBill(null);
    toast.success('Bill Revised', 'Order reopened for editing');
    navigate(
      bill.tableId
        ? `/order?table=${bill.tableId}&orderId=${newOrder.id}`
        : `/order?orderId=${newOrder.id}`
    );
  };

  const handleReprint = async (bill: Bill, printerId: string) => {
    const lines = buildBillReceipt({
      restaurantName: settings.restaurantName,
      address: settings.address,
      gstin: settings.gstin,
      invoiceNumber: bill.invoiceNumber,
      tableNumber: bill.tableNumber,
      orderType: bill.orderType,
      staffName: bill.staffName,
      items: bill.items,
      subtotal: bill.subtotal,
      totalGST: bill.totalGST,
      serviceCharge: bill.serviceCharge,
      parcelCharge: bill.parcelCharge,
      discountAmount: bill.discountAmount,
      roundOff: bill.roundOff,
      totalAmount: bill.totalAmount,
      paymentMode: bill.payments?.[0]?.mode || 'cash',
      amountPaid: bill.amountPaid,
      changeDue: bill.changeDue,
    });
    const result = await printReceipt(lines, printerId);
    if (result.success) {
      toast.success('Reprint Sent', `Bill ${bill.invoiceNumber} sent to printer`);
    } else {
      toast.error('Print Error', result.error || 'Failed to print');
    }
  };

  const enabledPrinters = (settings.printers || []).filter((p) => p.enabled !== false);

  return (
    <>
      <TopBar title="Bill History & Audit" />
      <div className="page-body">
        {/* Top-Level History Category Switcher */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          {/* Tabs for All / Deleted / Revised */}
          <div
            className="tabs"
            style={{
              padding: 4,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              display: 'inline-flex',
            }}
          >
            <button
              className={`tab-item ${historyTab === 'all' ? 'active' : ''}`}
              onClick={() => setHistoryTab('all')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              <Receipt size={18} />
              <span>All Invoices</span>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '2px 7px',
                  borderRadius: 10,
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-muted)',
                }}
              >
                {bills.length}
              </span>
            </button>

            <button
              className={`tab-item ${historyTab === 'deleted' ? 'active' : ''}`}
              onClick={() => setHistoryTab('deleted')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: historyTab === 'deleted' ? '#ef4444' : undefined,
              }}
            >
              <Trash size={18} color="#ef4444" />
              <span>Deleted / Voided</span>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '2px 7px',
                  borderRadius: 10,
                  background: deletedCount > 0 ? 'rgba(239,68,68,0.15)' : 'var(--bg-elevated)',
                  color: deletedCount > 0 ? '#ef4444' : 'var(--text-muted)',
                  fontWeight: 700,
                }}
              >
                {deletedCount}
              </span>
            </button>

            <button
              className={`tab-item ${historyTab === 'revised' ? 'active' : ''}`}
              onClick={() => setHistoryTab('revised')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: historyTab === 'revised' ? '#a855f7' : undefined,
              }}
            >
              <ArrowsClockwise size={18} color="#a855f7" />
              <span>Revised History</span>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '2px 7px',
                  borderRadius: 10,
                  background: revisedCount > 0 ? 'rgba(168,85,247,0.15)' : 'var(--bg-elevated)',
                  color: revisedCount > 0 ? '#a855f7' : 'var(--text-muted)',
                  fontWeight: 700,
                }}
              >
                {revisedCount}
              </span>
            </button>
          </div>

          {/* Date Range Selector */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              padding: '6px 12px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Date:
            </span>
            <div className="tabs" style={{ padding: 2 }}>
              {(['today', 'week', 'month', 'custom'] as const).map((r) => (
                <button
                  key={r}
                  className={`tab-item ${dateRange === r ? 'active' : ''}`}
                  onClick={() => setDateRange(r)}
                  style={{
                    padding: '5px 12px',
                    fontSize: '0.8125rem',
                    textTransform: 'capitalize',
                  }}
                >
                  {r === 'today' ? 'Today' : r === 'custom' ? 'Custom' : `This ${r.charAt(0).toUpperCase() + r.slice(1)}`}
                </button>
              ))}
            </div>
            {dateRange === 'custom' && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="date"
                  className="input"
                  style={{ width: 140, padding: '5px 8px', fontSize: '0.8125rem' }}
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>→</span>
                <input
                  type="date"
                  className="input"
                  style={{ width: 140, padding: '5px 8px', fontSize: '0.8125rem' }}
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
                <button className="btn btn-primary btn-sm" onClick={() => loadBillsManual(1)}>
                  Search
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tab Specific Banner / Summary */}
        {historyTab === 'deleted' && (
          <div
            style={{
              background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 18px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'rgba(239,68,68,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ef4444',
                }}
              >
                <Trash size={22} weight="bold" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#ef4444' }}>
                  Deleted & Voided Bills Audit Log
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  Complete audit history of cancelled bills, showing who deleted each bill and the cancellation reason.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Voided Bills</div>
                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#ef4444' }}>
                  {deletedCount}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Voided Total</div>
                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#ef4444' }}>
                  {formatAmount(deletedAmount)}
                </div>
              </div>
            </div>
          </div>
        )}

        {historyTab === 'revised' && (
          <div
            style={{
              background: 'rgba(168,85,247,0.06)',
              border: '1px solid rgba(168,85,247,0.25)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 18px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'rgba(168,85,247,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#a855f7',
                }}
              >
                <ArrowsClockwise size={22} weight="bold" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#a855f7' }}>
                  Revised Bills Audit Log
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  Audit log of bills that were reopened and revised for modifications, showing who revised them.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Revised Bills</div>
                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#a855f7' }}>
                  {revisedCount}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Revised Total</div>
                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#a855f7' }}>
                  {formatAmount(revisedAmount)}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <div className="card-title">
              {historyTab === 'all'
                ? 'All Invoices'
                : historyTab === 'deleted'
                ? 'Deleted / Voided Invoices'
                : 'Revised Invoices'}
            </div>
            {historyTab === 'all' && bills.length > 0 && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {paidCount} paid · {deletedCount} voided · {revisedCount} revised
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading bills...
            </div>
          ) : displayedBills.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
              <div className="empty-state-icon">
                {historyTab === 'deleted' ? (
                  <Trash size={28} />
                ) : historyTab === 'revised' ? (
                  <ArrowsClockwise size={28} />
                ) : (
                  <Receipt size={28} />
                )}
              </div>
              <div className="empty-state-title">
                {historyTab === 'deleted'
                  ? 'No deleted bills found'
                  : historyTab === 'revised'
                  ? 'No revised bills found'
                  : 'No bills found'}
              </div>
              <div className="empty-state-desc">No records found for the selected date range.</div>
            </div>
          ) : (
            <>
              {/* Header depending on historyTab */}
              <div
                style={{
                  display: 'flex',
                  borderBottom: '1px solid var(--border)',
                  padding: '12px 16px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  color: 'var(--text-muted)',
                }}
              >
                <div style={{ flex: '1.5' }}>Invoice No.</div>
                <div style={{ flex: '1.8' }}>Original Time</div>
                <div style={{ flex: '1.2' }}>Table / Type</div>
                <div style={{ flex: '1', textAlign: 'right', paddingRight: 16 }}>Amount</div>

                {historyTab === 'all' ? (
                  <>
                    <div style={{ flex: '1.5' }}>Billed By</div>
                    <div style={{ flex: '1' }}>Status</div>
                  </>
                ) : historyTab === 'deleted' ? (
                  <>
                    <div style={{ flex: '1.5' }}>Deleted By</div>
                    <div style={{ flex: '2' }}>Reason</div>
                  </>
                ) : (
                  <>
                    <div style={{ flex: '1.5' }}>Revised By</div>
                    <div style={{ flex: '2' }}>Revision Reason</div>
                  </>
                )}

                <div style={{ flex: '1', textAlign: 'right' }}>Action</div>
              </div>

              {/* Rows */}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 'calc(100vh - 380px)' }}>
                {displayedBills.map((bill) => (
                  <div
                    key={bill.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border)',
                      opacity: bill.status === 'void' ? 0.75 : 1,
                      background:
                        bill.status === 'void'
                          ? 'rgba(239,68,68,0.02)'
                          : bill.status === 'revised'
                          ? 'rgba(168,85,247,0.02)'
                          : undefined,
                    }}
                  >
                    <div style={{ flex: '1.5', fontWeight: 600 }}>
                      {bill.invoiceNumber}
                      {invoiceCounts[bill.invoiceNumber] > 1 && (
                        <span
                          title="Duplicate invoice number"
                          style={{
                            marginLeft: 6,
                            fontSize: '0.65rem',
                            background: 'rgba(245,158,11,0.15)',
                            color: '#f59e0b',
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontWeight: 700,
                          }}
                        >
                          ⚠ DUP
                        </span>
                      )}
                    </div>

                    <div style={{ flex: '1.8' }}>
                      <div style={{ fontSize: '0.85rem' }}>
                        {new Date(bill.createdAt).toLocaleDateString('en-IN')}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(bill.createdAt).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    <div style={{ flex: '1.2', textTransform: 'capitalize', fontSize: '0.85rem' }}>
                      {bill.tableNumber ? `Table ${bill.tableNumber}` : bill.orderType}
                    </div>

                    <div
                      style={{
                        flex: '1',
                        fontWeight: 700,
                        textAlign: 'right',
                        paddingRight: 16,
                        color:
                          bill.status === 'void'
                            ? '#ef4444'
                            : bill.status === 'revised'
                            ? '#a855f7'
                            : undefined,
                      }}
                    >
                      {formatAmount(bill.totalAmount)}
                    </div>

                    {historyTab === 'all' ? (
                      <>
                        <div style={{ flex: '1.5', fontSize: '0.85rem' }}>
                          <div>{bill.staffName}</div>
                          {bill.status === 'void' && bill.voidedBy && (
                            <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                              voided by: {bill.voidedBy}
                            </div>
                          )}
                          {bill.status === 'revised' && bill.revisedBy && (
                            <div style={{ fontSize: '0.75rem', color: '#a855f7' }}>
                              revised by: {bill.revisedBy}
                            </div>
                          )}
                        </div>
                        <div style={{ flex: '1' }}>
                          {bill.status === 'void' ? (
                            <span className="badge badge-error">Voided</span>
                          ) : bill.status === 'revised' ? (
                            <span
                              className="badge"
                              style={{
                                background: 'rgba(168,85,247,0.15)',
                                color: '#a855f7',
                                border: '1px solid rgba(168,85,247,0.3)',
                              }}
                            >
                              Revised
                            </span>
                          ) : (
                            <span className="badge badge-success">Paid</span>
                          )}
                        </div>
                      </>
                    ) : historyTab === 'deleted' ? (
                      <>
                        <div style={{ flex: '1.5' }}>
                          <span
                            className="badge"
                            style={{
                              background: 'rgba(239,68,68,0.12)',
                              color: '#ef4444',
                              border: '1px solid rgba(239,68,68,0.25)',
                              fontWeight: 700,
                            }}
                          >
                            {bill.voidedBy || 'Unknown'}
                          </span>
                          {bill.voidedAt && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              {new Date(bill.voidedAt).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            flex: '2',
                            fontSize: '0.85rem',
                            color: 'var(--text-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {bill.voidReason || 'No reason specified'}
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ flex: '1.5' }}>
                          <span
                            className="badge"
                            style={{
                              background: 'rgba(168,85,247,0.12)',
                              color: '#a855f7',
                              border: '1px solid rgba(168,85,247,0.25)',
                              fontWeight: 700,
                            }}
                          >
                            {bill.revisedBy || bill.voidedBy || 'Unknown'}
                          </span>
                          {bill.revisedAt && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              {new Date(bill.revisedAt).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            flex: '2',
                            fontSize: '0.85rem',
                            color: 'var(--text-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {bill.revisedReason || 'Order modified'}
                        </div>
                      </>
                    )}

                    <div style={{ flex: '1', textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSelectedBill(bill)}
                      >
                        <Eye size={16} /> View
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {totalBills > itemsPerPage && historyTab === 'all' && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                    {Math.min(currentPage * itemsPerPage, totalBills)} of {totalBills} bills
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => loadBillsManual(currentPage - 1)}
                      disabled={currentPage === 1 || loading}
                    >
                      Previous
                    </button>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 8px',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                      }}
                    >
                      Page {currentPage} of {Math.ceil(totalBills / itemsPerPage)}
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => loadBillsManual(currentPage + 1)}
                      disabled={currentPage >= Math.ceil(totalBills / itemsPerPage) || loading}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bill Details Modal */}
      {selectedBill && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
          }}
        >
          <div
            className="card"
            style={{
              width: 520,
              maxWidth: '92vw',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div className="card-header" style={{ justifyContent: 'space-between' }}>
              <div className="card-title">
                Invoice {selectedBill.invoiceNumber}
                {selectedBill.status === 'void' ? (
                  <span className="badge badge-error" style={{ marginLeft: 8 }}>
                    Voided
                  </span>
                ) : selectedBill.status === 'revised' ? (
                  <span
                    className="badge"
                    style={{
                      marginLeft: 8,
                      background: 'rgba(168,85,247,0.15)',
                      color: '#a855f7',
                      border: '1px solid rgba(168,85,247,0.3)',
                    }}
                  >
                    Revised
                  </span>
                ) : (
                  <span className="badge badge-success" style={{ marginLeft: 8 }}>
                    Paid
                  </span>
                )}
              </div>
              <button
                className="btn btn-ghost"
                style={{ padding: 4 }}
                onClick={() => setSelectedBill(null)}
              >
                <XCircle size={24} />
              </button>
            </div>

            <div className="card-body" style={{ overflowY: 'auto', flex: 1 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 16,
                  fontSize: '0.875rem',
                }}
              >
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Date & Time</div>
                  <div style={{ fontWeight: 600 }}>
                    {new Date(selectedBill.createdAt).toLocaleString('en-IN')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: 'var(--text-muted)' }}>Table / Type</div>
                  <div style={{ fontWeight: 600 }}>
                    {selectedBill.tableNumber
                      ? `Table ${selectedBill.tableNumber}`
                      : selectedBill.orderType}
                  </div>
                </div>
              </div>

              {/* Void Audit Box */}
              {selectedBill.status === 'void' && (
                <div
                  style={{
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: 8,
                    padding: '12px 14px',
                    marginBottom: 14,
                    fontSize: '0.85rem',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      color: '#ef4444',
                      marginBottom: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <WarningCircle size={18} weight="bold" /> Bill Deleted / Voided
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Deleted by:</span>{' '}
                    <strong>{selectedBill.voidedBy || 'Unknown'}</strong>
                  </div>
                  {selectedBill.voidedAt && (
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Deleted at:</span>{' '}
                      {new Date(selectedBill.voidedAt).toLocaleString('en-IN')}
                    </div>
                  )}
                  {selectedBill.voidReason && (
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Reason:</span>{' '}
                      {selectedBill.voidReason}
                    </div>
                  )}
                </div>
              )}

              {/* Revised Audit Box */}
              {selectedBill.status === 'revised' && (
                <div
                  style={{
                    background: 'rgba(168,85,247,0.08)',
                    border: '1px solid rgba(168,85,247,0.25)',
                    borderRadius: 8,
                    padding: '12px 14px',
                    marginBottom: 14,
                    fontSize: '0.85rem',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      color: '#a855f7',
                      marginBottom: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <ArrowsClockwise size={18} weight="bold" /> Bill Revised & Reopened
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Revised by:</span>{' '}
                    <strong>{selectedBill.revisedBy || selectedBill.voidedBy || 'Unknown'}</strong>
                  </div>
                  {selectedBill.revisedAt && (
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Revised at:</span>{' '}
                      {new Date(selectedBill.revisedAt).toLocaleString('en-IN')}
                    </div>
                  )}
                  {selectedBill.revisedReason && (
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Reason:</span>{' '}
                      {selectedBill.revisedReason}
                    </div>
                  )}
                </div>
              )}

              <div
                style={{
                  borderTop: '1px dashed var(--border)',
                  borderBottom: '1px dashed var(--border)',
                  padding: '12px 0',
                  marginBottom: 16,
                }}
              >
                <table style={{ width: '100%', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={{ paddingBottom: 8 }}>Item</th>
                      <th style={{ paddingBottom: 8, textAlign: 'center' }}>Qty</th>
                      <th style={{ paddingBottom: 8, textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedBill.items.map((item) => (
                      <tr key={item.id}>
                        <td style={{ padding: '4px 0' }}>
                          {item.menuItemName}
                          {item.variantName && (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                                marginLeft: 4,
                              }}
                            >
                              ({item.variantName})
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '4px 0', textAlign: 'center' }}>{item.quantity}</td>
                        <td style={{ padding: '4px 0', textAlign: 'right' }}>
                          {formatAmount(item.totalPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.875rem' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal</span>
                  <span>{formatAmount(selectedBill.subtotal)}</span>
                </div>
                {selectedBill.serviceCharge > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Service Charge</span>
                    <span>{formatAmount(selectedBill.serviceCharge)}</span>
                  </div>
                )}
                {(selectedBill.parcelCharge || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Parcel Charge</span>
                    <span>{formatAmount(selectedBill.parcelCharge || 0)}</span>
                  </div>
                )}
                {selectedBill.discountAmount > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      color: 'var(--status-free)',
                    }}
                  >
                    <span>Discount</span>
                    <span>-{formatAmount(selectedBill.discountAmount)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Total GST</span>
                  <span>{formatAmount(selectedBill.totalGST)}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: 700,
                    fontSize: '1rem',
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <span>Total</span>
                  <span>{formatAmount(selectedBill.totalAmount)}</span>
                </div>
              </div>
            </div>

            <div
              className="card-footer"
              style={{
                borderTop: '1px solid var(--border)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {/* Reprint Section */}
              {enabledPrinters.length > 0 && selectedBill.status === 'paid' && (
                <div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      marginBottom: 6,
                      textTransform: 'uppercase',
                    }}
                  >
                    Reprint to:
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {enabledPrinters.map((p) => (
                      <button
                        key={p.id}
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleReprint(selectedBill, p.id)}
                      >
                        <Printer size={14} /> {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons for active paid bills */}
              {selectedBill.status === 'paid' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setReviseModal(selectedBill);
                      setReviseReason('');
                    }}
                  >
                    <PencilSimple size={18} /> Revise Bill
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ color: 'var(--status-void)' }}
                    onClick={() =>
                      setVoidModal({
                        billId: selectedBill.id,
                        invoiceNumber: selectedBill.invoiceNumber,
                      })
                    }
                  >
                    <WarningCircle size={18} /> Void Bill
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Revise Confirmation Modal */}
      {reviseModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
          }}
        >
          <div className="card" style={{ width: 440, maxWidth: '90vw' }}>
            <div className="card-header">
              <div
                className="card-title"
                style={{ color: '#a855f7', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <ArrowsClockwise size={20} weight="bold" /> Revise Invoice {reviseModal.invoiceNumber}
              </div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                This will mark the current invoice as <strong>Revised</strong> and reopen the order with
                all items so you can edit quantities, add items, or adjust charges.
              </div>
              <div
                style={{
                  background: 'var(--bg-elevated)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.875rem',
                }}
              >
                <div>
                  Revising as:{' '}
                  <strong style={{ color: 'var(--accent)' }}>
                    {currentUser?.name || 'Current User'}
                  </strong>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Role: {currentUser?.role || 'Staff'}
                </div>
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    marginBottom: 6,
                  }}
                >
                  Reason for Revision <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Customer ordered more items, Wrong item added..."
                  value={reviseReason}
                  onChange={(e) => setReviseReason(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleReviseBill();
                  }}
                />
              </div>
            </div>
            <div
              className="card-footer"
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                borderTop: '1px solid var(--border)',
                padding: 16,
              }}
            >
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setReviseModal(null);
                  setReviseReason('');
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ background: '#a855f7', borderColor: '#a855f7' }}
                onClick={handleReviseBill}
              >
                <ArrowsClockwise size={16} /> Confirm & Reopen Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Confirmation Modal */}
      {voidModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
          }}
        >
          <div className="card" style={{ width: 440, maxWidth: '90vw' }}>
            <div className="card-header">
              <div
                className="card-title"
                style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <WarningCircle size={20} weight="bold" /> Void Bill {voidModal.invoiceNumber}
              </div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                This will permanently void the bill and remove it from revenue calculations. The action
                will be recorded in the shift audit log.
              </div>
              <div
                style={{
                  background: 'var(--bg-elevated)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.875rem',
                }}
              >
                <div>
                  Voiding as:{' '}
                  <strong style={{ color: '#ef4444' }}>
                    {currentUser?.name || 'Current User'}
                  </strong>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Role: {currentUser?.role || 'Staff'}
                </div>
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    marginBottom: 6,
                  }}
                >
                  Reason for voiding <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Customer cancelled, Accidental duplicate, Wrong table..."
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleVoidBill();
                  }}
                />
              </div>
            </div>
            <div
              className="card-footer"
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                borderTop: '1px solid var(--border)',
                padding: 16,
              }}
            >
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setVoidModal(null);
                  setVoidReason('');
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-secondary"
                style={{ color: '#ef4444', borderColor: '#ef4444' }}
                onClick={handleVoidBill}
              >
                <WarningCircle size={16} /> Confirm Void
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
