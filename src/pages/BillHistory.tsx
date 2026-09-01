import React, { useState, useEffect } from 'react';
import { useBillStore } from '../store/billStore';
import { useSettingsStore } from '../store/settingsStore';
import { useToast } from '../store/uiStore';
import { Bill } from '../types';
import { formatAmount } from '../lib/gst';
import { printReceipt, buildBillReceipt } from '../lib/printer';
import { Receipt, Eye, XCircle, Calendar, WarningCircle, Printer, PencilSimple } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { useNavigate } from 'react-router-dom';
import { useOrderStore } from '../store/orderStore';
import { useTableStore } from '../store/tableStore';

export default function BillHistory() {
  const { fetchBillsByDateRange, voidBill, bills: localBills } = useBillStore();
  const { settings } = useSettingsStore();
  const { recreateOrderWithItems, setActiveOrder } = useOrderStore();
  const { updateTableStatus } = useTableStore();
  const toast = useToast();
  const navigate = useNavigate();
  
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('today');
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);

  useEffect(() => {
    loadBills();
  }, [dateRange]);

  const loadBills = async () => {
    setLoading(true);
    const end = new Date();
    const start = new Date();
    
    if (dateRange === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (dateRange === 'week') {
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else if (dateRange === 'month') {
      start.setMonth(start.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
    }

    // Try Supabase first, fall back to local store
    let fetchedBills: Bill[] = [];
    try {
      const supabaseBills = await fetchBillsByDateRange(start, end);
      // Merge with local bills (in case Supabase is missing some)
      const localFiltered = localBills.filter((b) => {
        const d = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return d >= start && d <= end;
      });
      // Deduplicate by id, prefer Supabase version
      const allById: Record<string, Bill> = {};
      localFiltered.forEach((b) => { allById[b.id] = b; });
      supabaseBills.forEach((b) => { allById[b.id] = b; });
      fetchedBills = Object.values(allById);
    } catch (err) {
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


  const handleVoidBill = async (billId: string) => {
    if (!window.confirm('Are you sure you want to void this bill? This action cannot be undone and will remove it from revenue calculations.')) {
      return;
    }
    
    await voidBill(billId);
    toast.success('Bill Voided', 'The bill has been successfully voided.');
    setSelectedBill(null);
    loadBills();
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
      address:        settings.address,
      gstin:          settings.gstin,
      invoiceNumber:  bill.invoiceNumber,
      tableNumber:    bill.tableNumber,
      orderType:      bill.orderType,
      staffName:      bill.staffName,
      items:          bill.items,
      subtotal:       bill.subtotal,
      totalGST:       bill.totalGST,
      serviceCharge:  bill.serviceCharge,
      parcelCharge:   bill.parcelCharge,
      discountAmount: bill.discountAmount,
      roundOff:       bill.roundOff,
      totalAmount:    bill.totalAmount,
      paymentMode:    bill.payments?.[0]?.mode || 'cash',
      amountPaid:     bill.amountPaid,
      changeDue:      bill.changeDue,
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
      <TopBar
        title="Bill History"
        actions={
          <div className="tabs" style={{ padding: 3 }}>
            {(['today', 'week', 'month'] as const).map((r) => (
              <button
                key={r}
                className={`tab-item ${dateRange === r ? 'active' : ''}`}
                onClick={() => setDateRange(r)}
                style={{ padding: '6px 12px', fontSize: '0.8125rem', textTransform: 'capitalize' }}
              >
                {r === 'today' ? 'Today' : `This ${r}`}
              </button>
            ))}
          </div>
        }
      />
      <div className="page-body">
        <div className="card">
          <div className="card-header">
            <div className="card-title">All Invoices</div>
          </div>
          
          {loading ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading bills...
            </div>
          ) : bills.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
              <div className="empty-state-icon"><Receipt size={28} /></div>
              <div className="empty-state-title">No bills found</div>
              <div className="empty-state-desc">No bills generated in the selected date range.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice No.</th>
                    <th>Date & Time</th>
                    <th>Table / Type</th>
                    <th>Staff</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => (
                    <tr key={bill.id} style={{ opacity: bill.status === 'void' ? 0.6 : 1 }}>
                      <td style={{ fontWeight: 600 }}>{bill.invoiceNumber}</td>
                      <td>
                        <div style={{ fontSize: '0.875rem' }}>{new Date(bill.createdAt).toLocaleDateString('en-IN')}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {new Date(bill.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td>
                        {bill.tableNumber ? `Table ${bill.tableNumber}` : <span style={{ textTransform: 'capitalize' }}>{bill.orderType}</span>}
                      </td>
                      <td>{bill.staffName}</td>
                      <td style={{ fontWeight: 700 }}>{formatAmount(bill.totalAmount)}</td>
                      <td>
                        {bill.status === 'void' ? (
                          <span className="badge badge-error">Voided</span>
                        ) : (
                          <span className="badge badge-success">Paid</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setSelectedBill(bill)}
                        >
                          <Eye size={16} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
