import React, { useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrderStore } from '../store/orderStore';
import { useTableStore } from '../store/tableStore';
import { useSettingsStore } from '../store/settingsStore';
import { useBillStore } from '../store/billStore';
import { useShiftStore } from '../store/shiftStore';
import { useToast } from '../store/uiStore';
import { calculateGSTBreakdown, gstRoundOff, generateInvoiceNumber, formatAmount, calculateServiceCharge, calculateDiscount } from '../lib/gst';
import { Bill, Payment, PaymentMode, DiscountType } from '../types';
import { Printer, FilePdf, CurrencyInr, Receipt } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { useReactToPrint } from 'react-to-print';
import { QRCodeSVG } from 'qrcode.react';
import { printReceipt, buildBillReceipt } from '../lib/printer';
import { PrinterRole } from '../types';

export default function Billing() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('order');
  const { orders, updateOrderStatus } = useOrderStore();
  const order = orders.find((o) => o.id === orderId);
  const { updateTableStatus } = useTableStore();
  const { settings, incrementInvoiceCounter } = useSettingsStore();
  const { addBill } = useBillStore();
  const { addBillToShift } = useShiftStore();
  const toast = useToast();
  const cartItems = order?.items.filter((i) => i.status !== 'void') || [];

  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(settings.serviceChargeEnabled);
  const [applyParcelCharge, setApplyParcelCharge] = useState(settings.parcelChargeEnabled && order?.orderType === 'takeaway');
  const [discountType, setDiscountType] = useState<DiscountType>('flat');
  const [discountValue, setDiscountValue] = useState(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [cashTendered, setCashTendered] = useState('');
  const [upiRef, setUpiRef] = useState('');
  const [billGenerated, setBillGenerated] = useState<Bill | null>(null);

  const handlePrint = async (printerId: string = 'billing', bill?: Bill | null) => {
    const b = bill || billGenerated;
    if (!b) return;
    const lines = buildBillReceipt({
      restaurantName: settings.restaurantName,
      address:        settings.address,
      gstin:          settings.gstin,
      invoiceNumber:  b.invoiceNumber,
      tableNumber:    b.tableNumber,
      orderType:      b.orderType,
      staffName:      b.staffName,
      items:          b.items,
      subtotal:       b.subtotal,
      totalGST:       b.totalGST,
      serviceCharge:  b.serviceCharge,
      parcelCharge:   b.parcelCharge,
      discountAmount: b.discountAmount,
      roundOff:       b.roundOff,
      totalAmount:    b.totalAmount,
      paymentMode:    b.payments?.[0]?.mode || 'cash',
      amountPaid:     b.amountPaid,
      changeDue:      b.changeDue,
    });
    const result = await printReceipt(lines, printerId);
    if (!result.success) {
      toast.error('Print Error', result.error || 'Failed to print');
    } else {
      toast.success('Printed!', 'Sent to thermal printer');
    }
  };

  const subtotal = cartItems.reduce((sum, i) => sum + i.totalPrice, 0);
  const parcelCharge = applyParcelCharge ? settings.parcelCharge : 0;
  const subtotalWithCharges = subtotal + parcelCharge;
  const serviceCharge = serviceChargeEnabled ? calculateServiceCharge(subtotalWithCharges, settings.serviceChargePercent) : 0;
  const discountAmount = calculateDiscount(subtotalWithCharges, discountType, discountValue);
  const taxableBase = subtotalWithCharges + serviceCharge - discountAmount;

  // GST: only compute when enabled
  const gstBreakdown = settings.gstEnabled ? calculateGSTBreakdown(cartItems) : [];
  const totalGST = settings.gstEnabled ? gstBreakdown.reduce((sum, g) => sum + g.cgst + g.sgst + g.igst, 0) : 0;

  // Final total (prices are already GST-inclusive, so totalGST is just the tax component of taxableBase)
  const { rounded, roundOff } = gstRoundOff(taxableBase);
  const totalAmount = rounded;
  const changeDue = paymentMode === 'cash' && cashTendered ? parseFloat(cashTendered) - totalAmount : 0;

  const handleGenerateBill = () => {
    if (!order) return;
    if (!window.confirm('Are you sure you want to generate and save this bill? This action cannot be undone.')) return;
    
    const counter = incrementInvoiceCounter();
    const invoiceNumber = generateInvoiceNumber(settings.invoicePrefix, counter);

    const bill: Bill = {
      id: crypto.randomUUID(),
      invoiceNumber,
      orderId: order.id,
      tableId: order.tableId,
      tableNumber: order.tableNumber,
      orderType: order.orderType,
      items: cartItems,
      guestCount: order.guestCount,
      subtotal: subtotalWithCharges,
      gstBreakdown,
      totalGST,
      serviceCharge,
      serviceChargePercent: settings.serviceChargePercent,
      discountType,
      discountValue,
      discountAmount,
      roundOff,
      totalAmount,
      parcelCharge: applyParcelCharge ? settings.parcelCharge : 0,
      payments: [{ mode: paymentMode, amount: totalAmount }],
      amountPaid: parseFloat(cashTendered) || totalAmount,
      changeDue: Math.max(0, changeDue),
      staffName: order.staffName,
      createdAt: new Date(),
      outletName: settings.restaurantName,
      outletAddress: settings.address,
      outletGSTIN: settings.gstin,
    };

    setBillGenerated(bill);
    addBill(bill);
    // Track this bill in the active shift
    const cashPaid = paymentMode === 'cash' ? totalAmount : 0;
    const upiPaid = paymentMode === 'upi' ? totalAmount : 0;
    const cardPaid = paymentMode === 'card' ? totalAmount : 0;
    addBillToShift(cashPaid, upiPaid, cardPaid, totalAmount, order.guestCount || 0);
    updateOrderStatus(order.id, 'paid');
    if (order.tableId) updateTableStatus(order.tableId, 'free');
    toast.success('Bill Generated', `Invoice ${invoiceNumber} created`);
  };


  const upiQRValue = `upi://pay?pa=${settings.upiId}&pn=${encodeURIComponent(settings.restaurantName)}&am=${totalAmount}&cu=INR`;

  return (
    <>
      <TopBar title="Billing & Payment" />
      <div className="page-body">
        <div className="billing-layout">
          {/* Bill Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Order Items */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <Receipt size={18} style={{ display: 'inline', marginRight: 8 }} />
                  Order Items
                </div>
                {order?.tableNumber && <span className="badge badge-billing">Table {order.tableNumber}</span>}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Rate</th>
                      {settings.gstEnabled && <th>GST</th>}
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cartItems.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className={`veg-dot ${item.isVeg ? 'veg' : 'nonveg'}`} />
                            <div>
                              <div style={{ fontWeight: 600 }}>{item.menuItemName}</div>
                              {item.variantName && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.variantName}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{item.quantity}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAmount(item.unitPrice)}</td>
                        {settings.gstEnabled && <td><span className="badge badge-muted">{item.gstRate}%</span></td>}
                        <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatAmount(item.totalPrice)}</td>
                      </tr>

                    ))}
                  </tbody>
                </table>
              </div>

              {cartItems.length === 0 && (
                <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                  <div className="empty-state-icon"><Receipt size={28} /></div>
                  <div className="empty-state-title">No items</div>
                  <div className="empty-state-desc">Select an order or add items from the order screen</div>
                </div>
              )}
            </div>

            {/* Adjustments */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Adjustments</div>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Service Charge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Service Charge ({settings.serviceChargePercent}%)</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Optional</div>
                  </div>
                  <label className="switch">
                    <input type="checkbox" checked={serviceChargeEnabled} onChange={(e) => setServiceChargeEnabled(e.target.checked)} />
                    <span className="switch-slider" />
                  </label>
                </div>

                {/* Parcel Charge */}
                {settings.parcelChargeEnabled && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Parcel Charge (₹{settings.parcelCharge})</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Packaging fee</div>
                    </div>
                    <label className="switch">
                      <input type="checkbox" checked={applyParcelCharge} onChange={(e) => setApplyParcelCharge(e.target.checked)} />
                      <span className="switch-slider" />
                    </label>
                  </div>
                )}

                {/* Discount */}
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 8 }}>Discount</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select className="input select" value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)} style={{ width: 120 }}>
                      <option value="flat">Flat (₹)</option>
                      <option value="percent">Percent (%)</option>
                    </select>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={discountType === 'percent' ? 100 : subtotalWithCharges}
                      value={discountValue || ''}
                      onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                      placeholder={discountType === 'flat' ? '0.00' : '0'}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* GST Breakdown */}
            {settings.gstEnabled && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">GST Breakdown</div>
                <span className="badge badge-muted">GSTIN: {settings.gstin}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>GST Rate</th>
                      <th>Taxable</th>
                      <th>CGST</th>
                      <th>SGST</th>
                      <th style={{ textAlign: 'right' }}>Total Tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gstBreakdown.map((g) => (
                      <tr key={g.rate}>
                        <td>{g.rate}%</td>
                        <td>{formatAmount(g.taxableAmount)}</td>
                        <td>{formatAmount(g.cgst)}</td>
                        <td>{formatAmount(g.sgst)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatAmount(g.cgst + g.sgst)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                      <td colSpan={4} style={{ fontWeight: 700 }}>Total GST</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent)' }}>{formatAmount(totalGST)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            )}

          </div>

          {/* Right Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Bill Total */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Bill Summary</div>
              </div>
              <div className="card-body">
                <div className="bill-row">
                  <span>Items Subtotal</span><span className="amount">{formatAmount(subtotal)}</span>
                </div>
                {parcelCharge > 0 && (
                  <div className="bill-row">
                    <span>Parcel Charge</span>
                    <span className="amount">{formatAmount(parcelCharge)}</span>
                  </div>
                )}
                {serviceChargeEnabled && (
                  <div className="bill-row">
                    <span>Service Charge ({settings.serviceChargePercent}%)</span>
                    <span className="amount">{formatAmount(serviceCharge)}</span>
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className="bill-row" style={{ color: 'var(--status-free)' }}>
                    <span>Discount</span>
                    <span className="amount">-{formatAmount(discountAmount)}</span>
                  </div>
                )}
                {settings.gstEnabled && (
                <div className="bill-row">
                  <span>Total GST</span><span className="amount">{formatAmount(totalGST)}</span>
                </div>
                )}

                {roundOff !== 0 && (
                  <div className="bill-row">
                    <span>Round Off</span><span className="amount">{roundOff > 0 ? '+' : ''}{formatAmount(roundOff)}</span>
                  </div>
                )}
                <div className="bill-row total">
                  <span>Total</span><span className="amount">{formatAmount(totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Payment Mode */}
            <div className="card">
              <div className="card-header"><div className="card-title">Payment Mode</div></div>
              <div className="card-body">
                <div className="payment-mode-grid">
                  {(['cash', 'upi', 'card'] as PaymentMode[]).map((mode) => (
                    <button
                      key={mode}
                      className={`payment-mode-btn ${paymentMode === mode ? 'active' : ''}`}
                      onClick={() => setPaymentMode(mode)}
                    >
                      <CurrencyInr size={22} />
                      <span style={{ textTransform: 'capitalize' }}>{mode}</span>
                    </button>
                  ))}
                </div>

                {paymentMode === 'cash' && (
                  <div className="input-group" style={{ marginTop: 16 }}>
                    <label className="input-label">Cash Tendered (₹)</label>
                    <input
                      className="input"
                      type="number"
                      placeholder={totalAmount.toFixed(2)}
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                    />
                    {cashTendered && parseFloat(cashTendered) >= totalAmount && (
                      <div style={{ padding: '10px 12px', background: 'var(--status-free-bg)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(34,197,94,0.3)', marginTop: 8 }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Change Due</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--status-free)' }}>
                          {formatAmount(Math.max(0, changeDue))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {paymentMode === 'upi' && settings.upiId && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 16 }}>
                    <div style={{ background: 'white', padding: 12, borderRadius: 'var(--radius-md)' }}>
                      <QRCodeSVG value={upiQRValue} size={140} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>{settings.upiId}</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent)' }}>{formatAmount(totalAmount)}</div>
                    </div>
                    <input className="input" placeholder="UPI Reference No." value={upiRef} onChange={(e) => setUpiRef(e.target.value)} />
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="btn btn-primary btn-lg"
                onClick={handleGenerateBill}
                disabled={cartItems.length === 0}
                style={{ width: '100%' }}
              >
                <Receipt size={20} /> Generate Bill
              </button>
            {/* Printer Section — always visible */}
            <div style={{ marginTop: 8, padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                🖨️ Print Bill to Thermal Printer
              </div>
              {(settings.printers || []).length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--status-occupied)', padding: '8px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  ⚠️ No printers configured. Go to <strong>Settings → Printing</strong> to add your 4 thermal printers.
                </div>
              ) : !billGenerated ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px 10px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)' }}>
                  Generate the bill first, then click a printer below to print.
                </div>
              ) : null}
              {(settings.printers || []).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(settings.printers || []).filter(p => p.enabled !== false).map(p => (
                    <button
                      key={p.id}
                      className="btn btn-secondary"
                      style={{ width: '100%', justifyContent: 'flex-start', opacity: billGenerated ? 1 : 0.45, cursor: billGenerated ? 'pointer' : 'not-allowed' }}
                      onClick={() => billGenerated && handlePrint(p.id)}
                      title={!billGenerated ? 'Generate bill first' : `Print to ${p.name}`}
                    >
                      <Printer size={18} /> {p.name}
                      <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>({p.role})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
