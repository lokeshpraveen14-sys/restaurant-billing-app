import React, { useState, useEffect, useMemo } from 'react';
import { useBillStore } from '../store/billStore';
import { useSettingsStore } from '../store/settingsStore';
import { useToast } from '../store/uiStore';
import { Bill } from '../types';
import { formatAmount } from '../lib/gst';
import { printReceipt, buildBillReceipt } from '../lib/printer';
import { Receipt, Eye, XCircle, Calendar, WarningCircle, Printer, PencilSimple, CaretLeft, CaretRight } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { useNavigate } from 'react-router-dom';
import { useOrderStore } from '../store/orderStore';
import { useTableStore } from '../store/tableStore';
// @ts-ignore
import { FixedSizeList as List } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';

const Row = ({ index, style, data }: any) => {
  const bill = data.bills[index];
  const counts = data.invoiceCounts;
  return (
    <div style={{ ...style, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--border)', opacity: bill.status === 'void' ? 0.6 : 1 }}>
      <div style={{ flex: '1.5', fontWeight: 600 }}>
        {bill.invoiceNumber}
        {counts[bill.invoiceNumber] > 1 && (
          <span title="This invoice number appears more than once due to a prior sync bug. Check items and void the incorrect one."
            style={{ marginLeft: 6, fontSize: '0.65rem', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '2px 6px', borderRadius: 4, fontWeight: 700, cursor: 'help' }}
          >⚠ DUP</span>
        )}
      </div>
      <div style={{ flex: '2' }}>
        <div style={{ fontSize: '0.875rem' }}>{new Date(bill.createdAt).toLocaleDateString('en-IN')}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {new Date(bill.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      <div style={{ flex: '1.5', textTransform: 'capitalize' }}>
        {bill.tableNumber ? `Table ${bill.tableNumber}` : bill.orderType}
      </div>
      <div style={{ flex: '1.5' }}>{bill.staffName}</div>
      <div style={{ flex: '1', fontWeight: 700, textAlign: 'right', paddingRight: 16 }}>{formatAmount(bill.totalAmount)}</div>
      <div style={{ flex: '1' }}>
        {bill.status === 'void' ? (
          <span className="badge badge-error">Voided</span>
        ) : (
          <span className="badge badge-success">Paid</span>
        )}
      </div>
      <div style={{ flex: '1', textAlign: 'right' }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => data.setSelectedBill(bill)}
        >
          <Eye size={16} /> View
        </button>
      </div>
    </div>
  );
};

export default function BillHistory() {
  const fetchBillsByDateRange = useBillStore(s => s.fetchBillsByDateRange);
  const voidBill = useBillStore(s => s.voidBill);
  const localBills = useBillStore(s => s.bills);
  const settings = useSettingsStore(s => s.settings);
  const recreateOrderWithItems = useOrderStore(s => s.recreateOrderWithItems);
  const setActiveOrder = useOrderStore(s => s.setActiveOrder);
  const updateTableStatus = useTableStore(s => s.updateTableStatus);
  const toast = useToast();
  const navigate = useNavigate();

  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);

  const invoiceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    bills.forEach(b => { counts[b.invoiceNumber] = (counts[b.invoiceNumber] || 0) + 1; });
    return counts;
  }, [bills]);

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
        const s = new Date(customStart); s.setHours(0, 0, 0, 0);
        const e = new Date(customEnd); e.setHours(23, 59, 59, 999);
        start.setTime(s.getTime());
        end.setTime(e.getTime());
      }

      // Try Supabase first, fall back to local store
      let fetchedBills: Bill[] = [];
      try {
        const supabaseBills = await fetchBillsByDateRange(start, end);
        if (!isMounted) return;
        // Merge local bills that are in range (covers offline-created bills not yet in DB)
        const localFiltered = localBills.filter((b) => {
          const d = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
          return d >= start && d <= end;
        });

        const allById = new Map<string, Bill>();
        localFiltered.forEach(b => allById.set(b.id, b));
        supabaseBills.forEach(b => allById.set(b.id, b)); // Supabase wins on conflict
        fetchedBills = Array.from(allById.values());
      } catch (err) {
        if (!isMounted) return;
        // Fallback to local bills only
        fetchedBills = localBills.filter((b) => {
          const d = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
          return d >= start && d <= end;
        });
      }

      // Sort descending by date
      fetchedBills.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setBills(fetchedBills);
      setLoading(false);
    };

    if (dateRange !== 'custom') loadBills();
    // In custom mode, user must click Search to trigger it manually, so we don't auto load, 
    // but the manual trigger needs its own handling if it can overlap. 
    // Wait, the original code had: 
    // <button onClick={loadBills}>Search</button>
    // If we move it inside useEffect, we need a separate trigger state or keep it outside.
    return () => { isMounted = false; };
  }, [dateRange]);

  // Expose manual load for 'custom' date range button and void operations
  const loadBillsManual = async () => {
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
      const s = new Date(customStart); s.setHours(0, 0, 0, 0);
      const e = new Date(customEnd); e.setHours(23, 59, 59, 999);
      start.setTime(s.getTime());
      end.setTime(e.getTime());
    }

    let fetchedBills: Bill[] = [];
    try {
      const supabaseBills = await fetchBillsByDateRange(start, end);
      const localFiltered = localBills.filter((b) => {
        const d = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return d >= start && d <= end;
      });
      const allById = new Map<string, Bill>();
      localFiltered.forEach(b => allById.set(b.id, b));
      supabaseBills.forEach(b => allById.set(b.id, b)); 
      fetchedBills = Array.from(allById.values());
    } catch (err) {
      fetchedBills = localBills.filter((b) => {
        const d = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return d >= start && d <= end;
      });
    }

    fetchedBills.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setBills(fetchedBills);
    setLoading(false);
  };


  const handleVoidBill = async (billId: string) => {
    if (!window.confirm('Are you sure you want to void this bill? This action cannot be undone and will remove it from revenue calculations.')) {
      return;
    }

    await voidBill(billId);
    toast.success('Bill Voided', 'The bill has been successfully voided.');
    setSelectedBill(null);
    loadBillsManual();
  };

  const handleReviseBill = async (bill: Bill) => {
    if (!window.confirm('Are you sure you want to revise this bill? This will void the current bill and reopen the order so you can add items.')) {
      return;
    }

    // 1. Void the existing bill
    await voidBill(bill.id);

    // 2. Map items for re-creation
    const mappedItems = bill.items.map(item => ({
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      unitPrice: item.unitPrice || 0, // Fallback if missing
      quantity: item.quantity,
      totalPrice: item.totalPrice,
      variantName: item.variantName,
      addons: item.addons || [],
      isVeg: item.isVeg ?? true,
      gstRate: item.gstRate || 0,
    }));

    // 3. Re-create the order WITH items to avoid sync race condition
    const newOrder = recreateOrderWithItems(
      bill.tableId,
      bill.tableNumber,
      bill.orderType,
      'staff-id-revised', // fallback, actual staff id not in bill currently
      bill.staffName,
      bill.guestCount,
      mappedItems
    );

    // 4. Update table status if dine-in
    if (bill.tableId && bill.orderType === 'dine-in') {
      updateTableStatus(bill.tableId, 'occupied');
    }

    // 5. Navigate to order screen
    // recreateOrderWithItems automatically sets it as activeOrder
    toast.success('Bill Revised', 'Order reopened for editing');
    navigate(bill.tableId ? `/order?table=${bill.tableId}&orderId=${newOrder.id}` : `/order?orderId=${newOrder.id}`);
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

  const enabledPrinters = (settings.printers || []).filter(p => p.enabled !== false);

  return (
    <>
      <TopBar title="Bill History" />
      <div className="page-body">

        {/* Filter Bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '12px 16px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: 16,
        }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            Date Range:
          </span>
          <div className="tabs" style={{ padding: 3 }}>
            {(['today', 'week', 'month', 'custom'] as const).map((r) => (
              <button
                key={r}
                className={`tab-item ${dateRange === r ? 'active' : ''}`}
                onClick={() => setDateRange(r)}
                style={{ padding: '6px 14px', fontSize: '0.8125rem', textTransform: 'capitalize' }}
              >
                {r === 'today' ? 'Today' : r === 'custom' ? ' Custom' : `This ${r.charAt(0).toUpperCase() + r.slice(1)}`}
              </button>
            ))}
          </div>
          {dateRange === 'custom' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="date"
                className="input"
                style={{ width: 150, padding: '6px 10px', fontSize: '0.875rem' }}
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
              />
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>→</span>
              <input
                type="date"
                className="input"
                style={{ width: 150, padding: '6px 10px', fontSize: '0.875rem' }}
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
              />
              <button className="btn btn-primary btn-sm" onClick={loadBillsManual}>
                Search
              </button>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">All Invoices</div>
            {bills.length > 0 && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {bills.filter(b => b.status !== 'void').length} paid
                {(() => {
                  const counts: Record<string, number> = {};
                  bills.forEach(b => { counts[b.invoiceNumber] = (counts[b.invoiceNumber] || 0) + 1; });
                  const dupCount = Object.values(counts).filter(c => c > 1).length;
                  return dupCount > 0 ? (
                    <span style={{ color: '#f59e0b', marginLeft: 8 }}>⚠ {dupCount} duplicate invoice number{dupCount > 1 ? 's' : ''}</span>
                  ) : null;
                })()}
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading bills...
            </div>
          ) : bills.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
              <div className="empty-state-icon"><Receipt size={28} /></div>
              <div className="empty-state-title">No bills found</div>
              <div className="empty-state-desc">No bills for the selected date range</div>
            </div>
          ) : (
            <>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '12px 16px', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              <div style={{ flex: '1.5' }}>Invoice No.</div>
              <div style={{ flex: '2' }}>Date & Time</div>
              <div style={{ flex: '1.5' }}>Table / Type</div>
              <div style={{ flex: '1.5' }}>Staff</div>
              <div style={{ flex: '1', textAlign: 'right', paddingRight: 16 }}>Amount</div>
              <div style={{ flex: '1' }}>Status</div>
              <div style={{ flex: '1', textAlign: 'right' }}>Actions</div>
            </div>
            <div style={{ height: 'calc(100vh - 350px)' }}>
              {/* @ts-ignore */}
              <AutoSizer>
                {({ height, width }: { height: number, width: number }) => (
                  <List
                    height={height || 600}
                    itemCount={bills.length}
                    itemSize={70}
                    width={width || 1000}
                    itemData={{ bills, invoiceCounts, setSelectedBill }}
                  >
                    {Row}
                  </List>
                )}
              </AutoSizer>
            </div>
            
            </>
          )}
        </div>
      </div>

      {/* Bill Details Modal */}
      {selectedBill && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
          <div className="card" style={{ width: 500, maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="card-header" style={{ justifyContent: 'space-between' }}>
              <div className="card-title">
                Invoice {selectedBill.invoiceNumber}
                {selectedBill.status === 'void' && (
                  <span className="badge badge-error" style={{ marginLeft: 8 }}>Voided</span>
                )}
              </div>
              <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => setSelectedBill(null)}>
                <XCircle size={24} />
              </button>
            </div>

            <div className="card-body" style={{ overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: '0.875rem' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Date & Time</div>
                  <div style={{ fontWeight: 600 }}>{new Date(selectedBill.createdAt).toLocaleString('en-IN')}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: 'var(--text-muted)' }}>Table / Type</div>
                  <div style={{ fontWeight: 600 }}>{selectedBill.tableNumber ? `Table ${selectedBill.tableNumber}` : selectedBill.orderType}</div>
                </div>
              </div>

              <div style={{ borderTop: '1px dashed var(--border)', borderBottom: '1px dashed var(--border)', padding: '12px 0', marginBottom: 16 }}>
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
                          {item.variantName && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 4 }}>({item.variantName})</span>}
                        </td>
                        <td style={{ padding: '4px 0', textAlign: 'center' }}>{item.quantity}</td>
                        <td style={{ padding: '4px 0', textAlign: 'right' }}>{formatAmount(item.totalPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal</span><span>{formatAmount(selectedBill.subtotal)}</span>
                </div>
                {selectedBill.serviceCharge > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Service Charge</span><span>{formatAmount(selectedBill.serviceCharge)}</span>
                  </div>
                )}
                {(selectedBill.parcelCharge || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Parcel Charge</span><span>{formatAmount(selectedBill.parcelCharge || 0)}</span>
                  </div>
                )}
                {selectedBill.discountAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--status-free)' }}>
                    <span>Discount</span><span>-{formatAmount(selectedBill.discountAmount)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Total GST</span><span>{formatAmount(selectedBill.totalGST)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1rem', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <span>Total</span><span>{formatAmount(selectedBill.totalAmount)}</span>
                </div>
              </div>
            </div>

            <div className="card-footer" style={{ borderTop: '1px solid var(--border)', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Reprint Section */}
              {enabledPrinters.length > 0 && selectedBill.status !== 'void' && (
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>Reprint to:</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {enabledPrinters.map(p => (
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

              {/* Action Buttons */}
              {selectedBill.status !== 'void' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleReviseBill(selectedBill)}
                  >
                    <PencilSimple size={18} /> Revise Bill
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ color: 'var(--status-void)' }}
                    onClick={() => handleVoidBill(selectedBill.id)}
                  >
                    <WarningCircle size={18} /> Void Bill
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
