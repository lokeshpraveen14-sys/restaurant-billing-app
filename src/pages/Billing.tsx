import React, { useState, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrderStore } from '../store/orderStore';
import { useTableStore } from '../store/tableStore';
import { useSettingsStore } from '../store/settingsStore';
import { useBillStore } from '../store/billStore';
import { useShiftStore } from '../store/shiftStore';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../store/uiStore';
import { calculateGSTBreakdown, gstRoundOff, getNextInvoiceNumber, generateInvoiceNumber, formatAmount, calculateServiceCharge, calculateDiscount, determineIsInterState, sumCGST, sumSGST, sumIGST } from '../lib/gst';
import { Bill, Payment, PaymentMode, DiscountType } from '../types';
import { Printer, FilePdf, CurrencyInr, Receipt, UserCircle, CheckCircle, CreditCard, QrCode } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { useReactToPrint } from 'react-to-print';
import { QRCodeSVG } from 'qrcode.react';
import { printReceipt, buildBillReceipt } from '../lib/printer';
import { PrinterRole } from '../types';

export default function Billing() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('order');
  const orders = useOrderStore(s => s.orders);
  const updateOrderStatus = useOrderStore(s => s.updateOrderStatus);
  const order = orders.find((o) => o.id === orderId);
  const updateTableStatus = useTableStore(s => s.updateTableStatus);
  const settings = useSettingsStore(s => s.settings);
  const incrementInvoiceCounter = useSettingsStore(s => s.incrementInvoiceCounter);
  const addBill = useBillStore(s => s.addBill);
  const localBills = useBillStore(s => s.bills);
  const addBillToShift = useShiftStore(s => s.addBillToShift);
  const getActiveShiftForStaff = useShiftStore(s => s.getActiveShiftForStaff);
  const currentUser = useAuthStore(s => s.currentUser);
  const activeShift = getActiveShiftForStaff(currentUser?.id);
  const toast = useToast();
  const cartItems = order?.items.filter((i) => i.status !== 'void') || [];

  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(settings.serviceChargeEnabled);
  const [applyParcelCharge, setApplyParcelCharge] = useState(settings.parcelChargeEnabled && order?.orderType === 'takeaway');
  const [discountType, setDiscountType] = useState<DiscountType>('flat');
  const [discountValue, setDiscountValue] = useState(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [cashTendered, setCashTendered] = useState('');
  const [upiRef, setUpiRef] = useState('');
  // Split payment state
  const [splitCash, setSplitCash] = useState('');
  const [splitUpi, setSplitUpi] = useState('');
  const [splitCard, setSplitCard] = useState('');
  const [splitCashTendered, setSplitCashTendered] = useState('');
  const [billGenerated, setBillGenerated] = useState<Bill | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  // Optional customer details — completely optional
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [phoneAutoFilled, setPhoneAutoFilled] = useState(false);

  // Build phone → customer name lookup from previously stored bills (in-memory, zero cost)
  const phoneToName = useMemo(() => {
    const map = new Map<string, string>();
    localBills
      .filter(b => b.customerPhone && b.customerName && b.status !== 'void')
      .forEach(b => {
        const phone = b.customerPhone!.replace(/\D/g, '').slice(-10);
        if (phone && !map.has(phone)) map.set(phone, b.customerName!);
      });
    return map;
  }, [localBills]);

  // When phone changes, strictly enforce 10 numeric digits to stop accidental typing
  const handlePhoneChange = (raw: string) => {
    // Only allow digits 0-9 and strictly cap at 10 digits
    const digitsOnly = raw.replace(/\D/g, '').slice(0, 10);
    setCustomerPhone(digitsOnly);
    setPhoneAutoFilled(false);

    if (digitsOnly.length >= 7) {
      const found = phoneToName.get(digitsOnly);
      if (found && !customerName) {
        setCustomerName(found);
        setPhoneAutoFilled(true);
      }
    }
  };

  const handlePrint = async (printerId: string = 'billing', bill?: Bill | null) => {
    if (isPrinting) return;
    const b = bill || billGenerated;
    if (!b) return;
    setIsPrinting(true);
    try {
    const lines = buildBillReceipt({
      restaurantName: settings.restaurantName,
      address:        settings.address,
      gstin:          settings.gstin,
      invoiceNumber:  b.invoiceNumber,
      tableNumber:    b.tableNumber,
      orderType:      b.orderType,
      staffName:      b.staffName,
      customerName:   b.customerName,
      customerPhone:  b.customerPhone,
      items:          b.items,
      subtotal:       b.subtotal,
      totalGST:       b.totalGST,
      serviceCharge:  b.serviceCharge,
      parcelCharge:   b.parcelCharge,
      discountAmount: b.discountAmount,
      roundOff:       b.roundOff,
      totalAmount:    b.totalAmount,
      paymentMode:    b.payments && b.payments.length > 1 ? 'split' : (b.payments?.[0]?.mode || 'cash'),
      payments:       b.payments,
      amountPaid:     b.amountPaid,
      changeDue:      b.changeDue,
      gstBreakdown:   b.gstBreakdown,
    });
    const result = await printReceipt(lines, printerId);
    if (!result.success) {
      toast.error('Print Error', result.error || 'Failed to print');
    } else {
      toast.success('Printed!', 'Sent to thermal printer');
    }
    } finally {
      setTimeout(() => setIsPrinting(false), 2000);
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

  const numSplitCash = parseFloat(splitCash) || 0;
  const numSplitUpi = parseFloat(splitUpi) || 0;
  const numSplitCard = parseFloat(splitCard) || 0;

  const isSplitMode = paymentMode === 'split_cash_upi' || paymentMode === 'split_card_upi';
  const currentSplitAllocated = paymentMode === 'split_cash_upi'
    ? numSplitCash + numSplitUpi
    : paymentMode === 'split_card_upi'
    ? numSplitCard + numSplitUpi
    : totalAmount;

  const splitDifference = Math.round((totalAmount - currentSplitAllocated) * 100) / 100;
  const isSplitBalanced = !isSplitMode || (Math.abs(splitDifference) < 0.01 && (
    paymentMode === 'split_cash_upi' ? (numSplitCash > 0 && numSplitUpi > 0) : (numSplitCard > 0 && numSplitUpi > 0)
  ));

  const changeDue = paymentMode === 'cash'
    ? (cashTendered ? parseFloat(cashTendered) - totalAmount : 0)
    : paymentMode === 'split_cash_upi'
    ? (splitCashTendered ? parseFloat(splitCashTendered) - numSplitCash : 0)
    : 0;

  // Split auto-balancing handlers
  const handleSplitCashChange = (val: string) => {
    setSplitCash(val);
    const c = parseFloat(val);
    if (!isNaN(c) && c >= 0 && c <= totalAmount) {
      const remaining = Math.max(0, Math.round((totalAmount - c) * 100) / 100);
      setSplitUpi(remaining > 0 ? remaining.toString() : '0');
    }
  };

  const handleSplitUpiChange = (val: string) => {
    setSplitUpi(val);
    const u = parseFloat(val);
    if (!isNaN(u) && u >= 0 && u <= totalAmount) {
      if (paymentMode === 'split_cash_upi') {
        const remaining = Math.max(0, Math.round((totalAmount - u) * 100) / 100);
        setSplitCash(remaining > 0 ? remaining.toString() : '0');
      } else if (paymentMode === 'split_card_upi') {
        const remaining = Math.max(0, Math.round((totalAmount - u) * 100) / 100);
        setSplitCard(remaining > 0 ? remaining.toString() : '0');
      }
    }
  };

  const handleSplitCardChange = (val: string) => {
    setSplitCard(val);
    const cd = parseFloat(val);
    if (!isNaN(cd) && cd >= 0 && cd <= totalAmount) {
      const remaining = Math.max(0, Math.round((totalAmount - cd) * 100) / 100);
      setSplitUpi(remaining > 0 ? remaining.toString() : '0');
    }
  };

  const setEvenSplit = () => {
    const half = Math.round((totalAmount / 2) * 100) / 100;
    const remaining = Math.round((totalAmount - half) * 100) / 100;
    if (paymentMode === 'split_cash_upi') {
      setSplitCash(half.toString());
      setSplitUpi(remaining.toString());
    } else if (paymentMode === 'split_card_upi') {
      setSplitCard(half.toString());
      setSplitUpi(remaining.toString());
    }
  };

  const handleGenerateBill = async () => {
    if (!order) return;
    setIsGenerating(true);
    try {


    // Determine inter-state — no customer GSTIN on billing page; always intra-state for walk-in
    const interState = determineIsInterState(settings.businessState || '', undefined);

    // GST: always calculate and store — is_gst_bill mirrors global gstEnabled setting
    const gstBreakdown = settings.gstEnabled ? calculateGSTBreakdown(cartItems, interState) : [];
    const totalGST = gstBreakdown.reduce((sum, g) => sum + g.cgst + g.sgst + g.igst, 0);
    const cgstAmount = sumCGST(gstBreakdown);
    const sgstAmount = sumSGST(gstBreakdown);
    const igstAmount = sumIGST(gstBreakdown);

    // Place of supply = business state (walk-in, no customer GSTIN)
    const placeOfSupply = settings.businessState || '';

    // Snapshot HSN codes from menu items at bill time
    const hsnCodes: Record<string, string> = {};
    cartItems.forEach(item => {
      if ((item as any).hsnCode) hsnCodes[item.menuItemId] = (item as any).hsnCode;
    });

    // Get invoice number from DB (atomic) with local fallback
    const invoiceNumber = await getNextInvoiceNumber(
      settings.invoicePrefix,
      () => {
        const counter = incrementInvoiceCounter();
        return generateInvoiceNumber(settings.invoicePrefix, counter);
      }
    );

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
      cgstAmount,
      sgstAmount,
      igstAmount,
      serviceCharge,
      serviceChargePercent: settings.serviceChargePercent,
      discountType,
      discountValue,
      discountAmount,
      roundOff,
      totalAmount,
      parcelCharge: applyParcelCharge ? settings.parcelCharge : 0,
      payments: (() => {
        if (paymentMode === 'cash') return [{ mode: 'cash' as const, amount: totalAmount }];
        if (paymentMode === 'upi') return [{ mode: 'upi' as const, amount: totalAmount, reference: upiRef || undefined }];
        if (paymentMode === 'card') return [{ mode: 'card' as const, amount: totalAmount }];
        if (paymentMode === 'split_cash_upi') {
          return [
            { mode: 'cash' as const, amount: numSplitCash },
            { mode: 'upi' as const, amount: numSplitUpi, reference: upiRef || undefined },
          ];
        }
        if (paymentMode === 'split_card_upi') {
          return [
            { mode: 'card' as const, amount: numSplitCard },
            { mode: 'upi' as const, amount: numSplitUpi, reference: upiRef || undefined },
          ];
        }
        return [{ mode: 'cash' as const, amount: totalAmount }];
      })(),
      amountPaid: paymentMode === 'cash' && cashTendered
        ? (parseFloat(cashTendered) || totalAmount)
        : paymentMode === 'split_cash_upi' && splitCashTendered
        ? (parseFloat(splitCashTendered) || numSplitCash) + numSplitUpi
        : totalAmount,
      changeDue: Math.max(0, changeDue),
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      staffName: currentUser?.name || order.staffName,
      staffId: currentUser?.id,
      shiftId: activeShift?.id,
      createdAt: new Date(),
      outletName: settings.restaurantName,
      outletAddress: settings.address,
      outletGSTIN: settings.gstin,
      isGstBill: settings.gstEnabled,   // mirrors global toggle — no per-bill UI
      placeOfSupply,
      hsnCodes: Object.keys(hsnCodes).length > 0 ? hsnCodes : undefined,
    };

    setBillGenerated(bill);
    addBill(bill);

    // Track this bill in the active shift of this cashier with exact split breakdown
    let cashPaid = 0;
    let upiPaid = 0;
    let cardPaid = 0;

    if (paymentMode === 'cash') cashPaid = totalAmount;
    else if (paymentMode === 'upi') upiPaid = totalAmount;
    else if (paymentMode === 'card') cardPaid = totalAmount;
    else if (paymentMode === 'split_cash_upi') {
      cashPaid = numSplitCash;
      upiPaid = numSplitUpi;
    } else if (paymentMode === 'split_card_upi') {
      cardPaid = numSplitCard;
      upiPaid = numSplitUpi;
    }

    addBillToShift(cashPaid, upiPaid, cardPaid, totalAmount, order.guestCount || 0, currentUser?.id, activeShift?.id);

    // Capture sibling orders BEFORE updateOrderStatus removes this order from state
    const siblingOrders = order.tableId
      ? useOrderStore.getState().getOrdersByTable(order.tableId, order.tableNumber).filter(o => o.id !== order.id)
      : [];

    updateOrderStatus(order.id, 'paid');

    if (order.tableId && siblingOrders.length === 0) {
      useTableStore.getState().releaseTable(order.tableId);
    }
    toast.success('Bill Generated', `Invoice ${invoiceNumber} created`);
    } finally {
      setIsGenerating(false);
    }
  };



  const upiAmountForQR = paymentMode === 'upi'
    ? totalAmount
    : isSplitMode
    ? numSplitUpi
    : 0;

  const upiQRValue = `upi://pay?pa=${settings.upiId}&pn=${encodeURIComponent(settings.restaurantName)}&am=${upiAmountForQR > 0 ? upiAmountForQR.toFixed(2) : totalAmount.toFixed(2)}&cu=INR`;

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
                      <th>
                        Rate
                        {settings.gstEnabled && (
                          <span style={{ fontSize: '0.65rem', fontWeight: 400, color: 'var(--accent)', marginLeft: 4, verticalAlign: 'middle' }}>(Incl. GST)</span>
                        )}
                      </th>
                      {settings.gstEnabled && <th>GST%</th>}
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
                  <span>
                    Items Subtotal
                    {settings.gstEnabled && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--accent)', marginLeft: 6, fontWeight: 500 }}>incl. GST</span>
                    )}
                  </span>
                  <span className="amount">{formatAmount(subtotal)}</span>
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
                <div className="bill-row" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  <span>GST Included in Price</span><span className="amount">{formatAmount(totalGST)}</span>
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
                {settings.gstEnabled && (
                  <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(var(--accent-rgb, 230,168,23), 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(var(--accent-rgb, 230,168,23), 0.2)', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>✓ All prices are inclusive of GST (GSTIN: {settings.gstin})</span>
                  </div>
                )}
              </div>
            </div>

            {/* Customer Info — optional */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <UserCircle size={17} style={{ display: 'inline', marginRight: 6 }} />
                  Customer Info <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>(optional)</span>
                </div>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Phone FIRST — this is the lookup key */}
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="input-label" style={{ margin: 0 }}>Phone Number</label>
                    {customerPhone.length > 0 && (
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: customerPhone.length === 10 ? 'var(--status-free)' : 'var(--text-muted)'
                      }}>
                        {customerPhone.length}/10 digits {customerPhone.length === 10 && '✓'}
                      </span>
                    )}
                  </div>
                  <input
                    id="customer-phone"
                    className="input"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="10-digit mobile (e.g. 9876543210)"
                    value={customerPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    maxLength={10}
                  />
                  {/* Returning customer suggestion */}
                  {phoneAutoFilled && customerName && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6, marginTop: 6,
                      padding: '6px 10px', background: 'rgba(34,197,94,0.08)',
                      border: '1px solid rgba(34,197,94,0.25)', borderRadius: 'var(--radius-sm)',
                      fontSize: '0.8rem', color: 'var(--status-free)',
                    }}>
                      <CheckCircle size={15} weight="fill" />
                      <span>Returning customer — <strong>{customerName}</strong> auto-filled</span>
                      <button
                        style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                        onClick={() => { setCustomerName(''); setPhoneAutoFilled(false); }}
                      >✕ Clear</button>
                    </div>
                  )}
                </div>

                {/* Name SECOND — pre-filled for returning customers */}
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label">Customer Name</label>
                  <input
                    id="customer-name"
                    className="input"
                    type="text"
                    placeholder="e.g. Rahul Kumar"
                    value={customerName}
                    onChange={(e) => { setCustomerName(e.target.value); setPhoneAutoFilled(false); }}
                    maxLength={80}
                  />
                </div>

              </div>
            </div>

            {/* Payment Mode */}
            <div className="card">
              <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="card-title">Payment Mode</div>
                <span className="badge badge-muted" style={{ fontSize: '0.72rem' }}>
                  {paymentMode === 'split_cash_upi' ? 'Split: Cash + UPI' : paymentMode === 'split_card_upi' ? 'Split: Card + UPI' : paymentMode.toUpperCase()}
                </span>
              </div>

              <div className="card-body">
                {/* Single Payment Tender */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Single Payment
                  </div>
                  <div className="payment-mode-grid">
                    <button
                      type="button"
                      className={`payment-mode-btn ${paymentMode === 'cash' ? 'active' : ''}`}
                      onClick={() => setPaymentMode('cash')}
                    >
                      <CurrencyInr size={22} />
                      <span>Cash</span>
                    </button>
                    <button
                      type="button"
                      className={`payment-mode-btn ${paymentMode === 'upi' ? 'active' : ''}`}
                      onClick={() => setPaymentMode('upi')}
                    >
                      <QrCode size={22} />
                      <span>UPI</span>
                    </button>
                    <button
                      type="button"
                      className={`payment-mode-btn ${paymentMode === 'card' ? 'active' : ''}`}
                      onClick={() => setPaymentMode('card')}
                    >
                      <CreditCard size={22} />
                      <span>Card</span>
                    </button>
                  </div>
                </div>

                {/* Split Payment Tender (Cash + UPI and Card + UPI) */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Split Payment (Multi-Tender)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)' }}>
                    <button
                      type="button"
                      className={`payment-mode-btn ${paymentMode === 'split_cash_upi' ? 'active' : ''}`}
                      onClick={() => {
                        setPaymentMode('split_cash_upi');
                        if (!splitCash && !splitUpi) {
                          const half = Math.round((totalAmount / 2) * 100) / 100;
                          setSplitCash(half.toString());
                          setSplitUpi((Math.round((totalAmount - half) * 100) / 100).toString());
                        }
                      }}
                      style={{ padding: '10px 12px' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CurrencyInr size={18} />
                        <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>+</span>
                        <QrCode size={18} />
                      </div>
                      <span style={{ fontWeight: 700 }}>Cash + UPI</span>
                    </button>

                    <button
                      type="button"
                      className={`payment-mode-btn ${paymentMode === 'split_card_upi' ? 'active' : ''}`}
                      onClick={() => {
                        setPaymentMode('split_card_upi');
                        if (!splitCard && !splitUpi) {
                          const half = Math.round((totalAmount / 2) * 100) / 100;
                          setSplitCard(half.toString());
                          setSplitUpi((Math.round((totalAmount - half) * 100) / 100).toString());
                        }
                      }}
                      style={{ padding: '10px 12px' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CreditCard size={18} />
                        <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>+</span>
                        <QrCode size={18} />
                      </div>
                      <span style={{ fontWeight: 700 }}>Card + UPI</span>
                    </button>
                  </div>
                </div>

                {/* ── Single Cash Tender ── */}
                {paymentMode === 'cash' && (
                  <div className="input-group" style={{ marginTop: 14 }}>
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

                {/* ── Single UPI ── */}
                {paymentMode === 'upi' && settings.upiId && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 14 }}>
                    <div style={{ background: 'white', padding: 12, borderRadius: 'var(--radius-md)' }}>
                      <QRCodeSVG value={upiQRValue} size={140} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>{settings.upiId}</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent)' }}>{formatAmount(totalAmount)}</div>
                    </div>
                    <input className="input" placeholder="UPI Reference / Transaction ID (optional)" value={upiRef} onChange={(e) => setUpiRef(e.target.value)} />
                  </div>
                )}

                {/* ── SPLIT CASH + UPI DETAILS ── */}
                {paymentMode === 'split_cash_upi' && (
                  <div style={{
                    marginTop: 14,
                    padding: '14px',
                    background: 'var(--bg)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        Split Verification (Total: {formatAmount(totalAmount)})
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                        onClick={setEvenSplit}
                      >
                        50 / 50 Split
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label className="input-label" style={{ fontSize: '0.75rem' }}>Cash Amount (₹)</label>
                        <input
                          type="number"
                          step="any"
                          className="input"
                          placeholder="0.00"
                          value={splitCash}
                          onChange={(e) => handleSplitCashChange(e.target.value)}
                        />
                      </div>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label className="input-label" style={{ fontSize: '0.75rem' }}>UPI Amount (₹)</label>
                        <input
                          type="number"
                          step="any"
                          className="input"
                          placeholder="0.00"
                          value={splitUpi}
                          onChange={(e) => handleSplitUpiChange(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Balance validation alert */}
                    {Math.abs(splitDifference) < 0.01 && numSplitCash > 0 && numSplitUpi > 0 ? (
                      <div style={{
                        padding: '8px 10px',
                        background: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.78rem',
                        color: 'var(--status-free)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 10,
                      }}>
                        <CheckCircle size={15} weight="fill" />
                        <span>Balanced: <strong>Cash {formatAmount(numSplitCash)}</strong> + <strong>UPI {formatAmount(numSplitUpi)}</strong> = {formatAmount(totalAmount)}</span>
                      </div>
                    ) : (
                      <div style={{
                        padding: '8px 10px',
                        background: splitDifference > 0 ? 'rgba(234, 179, 8, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: splitDifference > 0 ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.78rem',
                        color: splitDifference > 0 ? '#eab308' : '#ef4444',
                        marginBottom: 10,
                      }}>
                        {splitDifference > 0
                          ? `⚠️ ${formatAmount(splitDifference)} remaining to allocate to match ${formatAmount(totalAmount)}`
                          : `❌ Split exceeds bill total by ${formatAmount(-splitDifference)}`}
                      </div>
                    )}

                    {/* Optional: Cash Tendered to calculate change */}
                    {numSplitCash > 0 && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 10 }}>
                        <label className="input-label" style={{ fontSize: '0.75rem' }}>Cash Tendered by Customer (Optional for change)</label>
                        <input
                          type="number"
                          step="any"
                          className="input"
                          placeholder={`e.g. ${Math.ceil(numSplitCash / 50) * 50 || numSplitCash}`}
                          value={splitCashTendered}
                          onChange={(e) => setSplitCashTendered(e.target.value)}
                        />
                        {splitCashTendered && parseFloat(splitCashTendered) >= numSplitCash && (
                          <div style={{ padding: '8px 10px', background: 'var(--status-free-bg)', borderRadius: 'var(--radius-sm)', marginTop: 6, fontSize: '0.8rem', color: 'var(--status-free)', fontWeight: 700 }}>
                            Change to Return: {formatAmount(parseFloat(splitCashTendered) - numSplitCash)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Dynamic UPI QR Code for the exact UPI portion */}
                    {numSplitUpi > 0 && settings.upiId && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          Scan to Pay UPI portion: <strong style={{ color: 'var(--accent)' }}>{formatAmount(numSplitUpi)}</strong>
                        </div>
                        <div style={{ background: 'white', padding: 8, borderRadius: 'var(--radius-md)' }}>
                          <QRCodeSVG value={upiQRValue} size={110} />
                        </div>
                        <input
                          className="input"
                          placeholder="UPI Ref / Txn ID (optional)"
                          style={{ fontSize: '0.8rem' }}
                          value={upiRef}
                          onChange={(e) => setUpiRef(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* ── SPLIT CARD + UPI DETAILS ── */}
                {paymentMode === 'split_card_upi' && (
                  <div style={{
                    marginTop: 14,
                    padding: '14px',
                    background: 'var(--bg)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        Split Verification (Total: {formatAmount(totalAmount)})
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                        onClick={setEvenSplit}
                      >
                        50 / 50 Split
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label className="input-label" style={{ fontSize: '0.75rem' }}>Card Amount (₹)</label>
                        <input
                          type="number"
                          step="any"
                          className="input"
                          placeholder="0.00"
                          value={splitCard}
                          onChange={(e) => handleSplitCardChange(e.target.value)}
                        />
                      </div>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label className="input-label" style={{ fontSize: '0.75rem' }}>UPI Amount (₹)</label>
                        <input
                          type="number"
                          step="any"
                          className="input"
                          placeholder="0.00"
                          value={splitUpi}
                          onChange={(e) => handleSplitUpiChange(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Balance validation alert */}
                    {Math.abs(splitDifference) < 0.01 && numSplitCard > 0 && numSplitUpi > 0 ? (
                      <div style={{
                        padding: '8px 10px',
                        background: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.78rem',
                        color: 'var(--status-free)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 10,
                      }}>
                        <CheckCircle size={15} weight="fill" />
                        <span>Balanced: <strong>Card {formatAmount(numSplitCard)}</strong> + <strong>UPI {formatAmount(numSplitUpi)}</strong> = {formatAmount(totalAmount)}</span>
                      </div>
                    ) : (
                      <div style={{
                        padding: '8px 10px',
                        background: splitDifference > 0 ? 'rgba(234, 179, 8, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: splitDifference > 0 ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.78rem',
                        color: splitDifference > 0 ? '#eab308' : '#ef4444',
                        marginBottom: 10,
                      }}>
                        {splitDifference > 0
                          ? `⚠️ ${formatAmount(splitDifference)} remaining to allocate to match ${formatAmount(totalAmount)}`
                          : `❌ Split exceeds bill total by ${formatAmount(-splitDifference)}`}
                      </div>
                    )}

                    {/* Dynamic UPI QR Code for the exact UPI portion */}
                    {numSplitUpi > 0 && settings.upiId && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          Scan to Pay UPI portion: <strong style={{ color: 'var(--accent)' }}>{formatAmount(numSplitUpi)}</strong>
                        </div>
                        <div style={{ background: 'white', padding: 8, borderRadius: 'var(--radius-md)' }}>
                          <QRCodeSVG value={upiQRValue} size={110} />
                        </div>
                        <input
                          className="input"
                          placeholder="UPI Ref / Txn ID (optional)"
                          style={{ fontSize: '0.8rem' }}
                          value={upiRef}
                          onChange={(e) => setUpiRef(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="btn btn-primary btn-lg"
                onClick={handleGenerateBill}
                disabled={cartItems.length === 0 || isGenerating || !isSplitBalanced}
                style={{ width: '100%' }}
              >
                {isGenerating ? (
                  <>
                    <span className="spinner" style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }} />
                    Generating...
                  </>
                ) : (
                  <>
                    <Receipt size={20} /> Generate Bill
                  </>
                )}
              </button>
              {!isSplitBalanced && (
                <div style={{ textAlign: 'center', fontSize: '0.78rem', color: '#eab308' }}>
                  ⚠️ Please balance split amounts to equal {formatAmount(totalAmount)} to generate bill
                </div>
              )}
            </div>
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
                      style={{ width: '100%', justifyContent: 'flex-start', opacity: (billGenerated && !isPrinting) ? 1 : 0.45, cursor: (billGenerated && !isPrinting) ? 'pointer' : 'not-allowed' }}
                      disabled={!billGenerated || isPrinting}
                      onClick={() => billGenerated && !isPrinting && handlePrint(p.id)}
                      title={!billGenerated ? 'Generate bill first' : isPrinting ? 'Printing in progress...' : `Print to ${p.name}`}
                    >
                      <Printer size={18} /> {isPrinting ? 'Sending to printer...' : p.name}
                      <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>({p.role})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
