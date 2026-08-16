import React, { useState } from 'react';
import { useMenuStore } from '../store/menuStore';
import { useBillStore } from '../store/billStore';
import { useShiftStore } from '../store/shiftStore';
import { useSettingsStore } from '../store/settingsStore';
import { useToast } from '../store/uiStore';
import { formatAmount } from '../lib/gst';
import { Plus, Minus, Printer, Drop, ShoppingCart, X } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { OrderItem, Bill } from '../types';
import { calculateGSTBreakdown, gstRoundOff, generateInvoiceNumber } from '../lib/gst';
import { useReactToPrint } from 'react-to-print';
import { printReceipt, buildBillReceipt, buildKotReceipt, BillPrintData, KotPrintData } from '../lib/printer';
import { PrinterRole } from '../types';

interface CartEntry {
  menuItemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  isVeg: boolean;
  gstRate: number;
  variantName?: string;
}

export default function JuiceCounter() {
  const { items, categories } = useMenuStore();
  const { addBill } = useBillStore();
  const { addBillToShift } = useShiftStore();
  const { settings, incrementInvoiceCounter } = useSettingsStore();
  const toast = useToast();

  const juiceCategories = categories.filter((c) => c.type === 'juice');
  const juiceCategoryIds = juiceCategories.map((c) => c.id);
  const juiceItems = items.filter((i) => i.isJuice || juiceCategoryIds.includes(i.categoryId));

  const [cart, setCart] = useState<CartEntry[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [billGenerated, setBillGenerated] = useState<Bill | null>(null);
  const [variantModal, setVariantModal] = useState<typeof juiceItems[0] | null>(null);
  const printRef = React.useRef<HTMLDivElement>(null);
  const kotRef = React.useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ content: () => printRef.current });
  const handleKotPrint = useReactToPrint({ content: () => kotRef.current });

  const displayItems = juiceItems.filter(
    (i) => (!selectedCat || i.categoryId === selectedCat) && i.available
  );

  const sendToCloudPrinter = async (role: PrinterRole, type: 'bill' | 'kot') => {
    if (!billGenerated) return;
    
    if (type === 'bill') {
      const printData: BillPrintData = {
        restaurantName: settings.restaurantName,
        address: settings.address,
        gstin: settings.gstin,
        invoiceNumber: billGenerated.invoiceNumber,
        orderType: 'counter',
        staffName: 'Juice Counter',
        items: billGenerated.items.map(i => ({
          menuItemName: i.menuItemName,
          quantity: i.quantity,
          totalPrice: i.totalPrice
        })),
        subtotal: billGenerated.subtotal,
        totalGST: billGenerated.totalGST,
        serviceCharge: billGenerated.serviceCharge,
        discountAmount: billGenerated.discountAmount,
        roundOff: billGenerated.roundOff,
        totalAmount: billGenerated.totalAmount,
        paymentMode: billGenerated.payments?.[0]?.mode || 'cash',
        amountPaid: billGenerated.amountPaid,
        changeDue: billGenerated.changeDue,
      };
      
      const lines = buildBillReceipt(printData);
      const { method, error } = await printReceipt(lines, role, () => {});
      
      if (method === 'bridge') {
        toast.success('Cloud Print Sent', `Printing bill to ${role} printer...`);
      } else if (error) {
        toast.error('Print Error', error);
      }
    } else {
      const kotData: KotPrintData = {
        orderType: 'counter',
        staffName: 'Juice Counter',
        items: billGenerated.items.map(i => ({
          menuItemName: i.menuItemName,
          quantity: i.quantity
        })),
        kotTime: new Date().toLocaleTimeString('en-IN', { hour12: true })
      };
      
      const lines = buildKotReceipt(kotData);
      const { method, error } = await printReceipt(lines, role, () => {});
      
      if (method === 'bridge') {
        toast.success('Cloud Print Sent', `Printing KOT to ${role} printer...`);
      } else if (error) {
        toast.error('Print Error', error);
      }
    }
  };

  const handleAdd = (item: typeof juiceItems[0]) => {
    if (item.variants && item.variants.length > 1) {
      setVariantModal(item);
      return;
    }
    const price = item.variants[0]?.price || item.basePrice;
    addToCart(item, price);
  };

  const addToCart = (item: typeof juiceItems[0], price: number, variantName?: string) => {
    const key = `${item.id}-${variantName || ''}`;
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id && c.variantName === variantName);
      if (existing) {
        return prev.map((c) =>
          c.menuItemId === item.id && c.variantName === variantName
            ? { ...c, qty: c.qty + 1, total: (c.qty + 1) * c.unitPrice }
            : c
        );
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: variantName ? `${item.name} (${variantName})` : item.name,
          qty: 1,
          unitPrice: price,
          total: price,
          isVeg: item.isVeg,
          gstRate: item.gstRate,
          variantName,
        },
      ];
    });
    setVariantModal(null);
  };

  const subtotal = cart.reduce((s, c) => s + c.total, 0);
  const fakeOrderItems: OrderItem[] = cart.map((c) => ({
    id: c.menuItemId,
    menuItemId: c.menuItemId,
    menuItemName: c.name,
    addons: [],
    quantity: c.qty,
    unitPrice: c.unitPrice,
    totalPrice: c.total,
    isVeg: c.isVeg,
    gstRate: settings.gstEnabled ? c.gstRate : 0,
    status: 'pending' as const,
    kotType: 'juice' as const,
  }));
  const gstBreakdown = settings.gstEnabled ? calculateGSTBreakdown(fakeOrderItems) : [];
  const totalGST = gstBreakdown.reduce((s, g) => s + g.cgst + g.sgst, 0);
  const { rounded } = gstRoundOff(subtotal + totalGST);

  const generateBill = () => {
    if (!window.confirm('Generate and save bill for these items?')) return;

    const counter = incrementInvoiceCounter();
    const invoiceNumber = generateInvoiceNumber(settings.invoicePrefix, counter);

    const mappedItems: OrderItem[] = cart.map((c) => ({
      id: crypto.randomUUID(),
      menuItemId: c.menuItemId,
      menuItemName: c.name,
      quantity: c.qty,
      unitPrice: c.unitPrice,
      totalPrice: c.total,
      status: 'served',
      addons: [],
      isVeg: c.isVeg,
      gstRate: c.gstRate,
      kotType: 'juice' as const,
    }));

    const roundOff = rounded - (subtotal + totalGST);

    const newBill: Bill = {
      id: crypto.randomUUID(),
      invoiceNumber,
      orderId: crypto.randomUUID(),
      orderType: 'counter',
      items: mappedItems,
      subtotal,
      gstBreakdown,
      totalGST,
      serviceCharge: 0,
      serviceChargePercent: 0,
      discountType: 'flat',
      discountValue: 0,
      discountAmount: 0,
      roundOff,
      totalAmount: rounded,
      payments: [{ mode: 'cash', amount: rounded }],
      amountPaid: rounded,
      changeDue: 0,
      staffName: 'Juice Counter',
      createdAt: new Date(),
      outletName: settings.restaurantName,
      outletAddress: settings.address,
      outletGSTIN: settings.gstin,
    };

    addBill(newBill);
    addBillToShift(rounded, 0, 0, rounded, 0); // Juice counter is cash only by default, 0 covers
    setBillGenerated(newBill);

    toast.success('Bill Generated', `Invoice ${invoiceNumber} created`);
    setCart([]);
  };

  return (
    <>
      <TopBar title="Juice Counter" />
      <div style={{ display: 'flex', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
        {/* Products */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
            <div className="scroll-tabs">
              <button className={`scroll-tab ${!selectedCat ? 'active' : ''}`} onClick={() => setSelectedCat(null)}>All</button>
              {juiceCategories.map((c) => (
                <button key={c.id} className={`scroll-tab ${selectedCat === c.id ? 'active' : ''}`} onClick={() => setSelectedCat(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4) var(--space-5)' }}>
            <div className="grid grid-menu" style={{ gap: 'var(--space-3)' }}>
              {displayItems.map((item) => (
                <div key={item.id} className="menu-item-card" onClick={() => handleAdd(item)}
                  style={{ borderTop: '3px solid #06b6d4' }}>
                  {item.isSpecial && (
                    <div style={{ position: 'absolute', top: 8, right: 8, background: '#06b6d4', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '2px 7px', borderRadius: 'var(--radius-full)' }}>
                      Special
                    </div>
                  )}
                  <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>🥤</div>
                  <div className="menu-item-name">{item.name}</div>
                  {item.description && <div className="menu-item-desc">{item.description}</div>}
                  <div className="menu-item-footer">
                    <div className="menu-item-price">{formatAmount(item.variants[0]?.price || item.basePrice)}</div>
                    <button className="menu-add-btn" style={{ background: '#06b6d4' }}>
                      <Plus size={16} weight="bold" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {displayItems.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon"><Drop size={28} /></div>
                <div className="empty-state-title">No juice items found</div>
                <div className="empty-state-desc">Add juice category items in Menu Management</div>
              </div>
            )}
            
            <div className="mobile-cart-fab" onClick={() => setIsCartOpen(true)}>
              <ShoppingCart size={24} weight="fill" />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <span style={{ fontSize: '0.85rem' }}>View Cart</span>
                <span style={{ fontSize: '0.7rem', color: 'rgba(0,0,0,0.7)' }}>{cart.length} items · {formatAmount(subtotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Cart Overlay */}
        {isCartOpen && (
          <div 
            className="mobile-cart-overlay"
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 95 }}
            onClick={() => setIsCartOpen(false)}
          />
        )}

        {/* Cart */}
        <div className={`cart-panel ${isCartOpen ? 'cart-open' : ''}`}>
          <div className="cart-header">
            <div>
              <div style={{ fontWeight: 700 }}>Juice Counter Sale</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cart.length} item{cart.length !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Drop className="hide-on-mobile" size={20} color="#06b6d4" weight="fill" />
              <button className="mobile-cart-close" onClick={() => setIsCartOpen(false)}>
                <X size={16} weight="bold" />
              </button>
            </div>
          </div>

          <div className="cart-items">
            {cart.length === 0 ? (
              billGenerated ? (
                <div className="empty-state" style={{ padding: 'var(--space-6)', background: 'rgba(6,182,212,0.08)', border: '1px solid #06b6d4', margin: 'var(--space-4)' }}>
                  <div className="empty-state-icon" style={{ width: 64, height: 64, background: '#06b6d4', color: 'white', marginBottom: 'var(--space-4)' }}>
                    <Printer size={32} />
                  </div>
                  <div className="empty-state-title" style={{ color: '#06b6d4' }}>Bill Generated!</div>
                  <div style={{ fontWeight: 600, marginBottom: 'var(--space-4)' }}>{billGenerated.invoiceNumber}</div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginBottom: 12 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Print to:</div>
                    {(settings.printers || []).filter(p => p.enabled).map(p => (
                      <div key={p.id} style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary" style={{ flex: 1, background: '#06b6d4', borderColor: '#06b6d4' }} onClick={() => sendToCloudPrinter(p.role, 'bill')}>
                          🖨️ Bill ({p.name})
                        </button>
                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => sendToCloudPrinter(p.role, 'kot')}>
                          🖨️ KOT ({p.name})
                        </button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.8rem' }} onClick={() => handlePrint()}>
                        📄 Browser Bill
                      </button>
                      <button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.8rem' }} onClick={() => handleKotPrint()}>
                        📄 Browser KOT
                      </button>
                    </div>
                  </div>

                  <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setBillGenerated(null)}>
                    New Order
                  </button>
                </div>
              ) : (
                <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
                  <div className="empty-state-icon" style={{ width: 48, height: 48 }}><Drop size={24} /></div>
                  <div className="empty-state-title" style={{ fontSize: '0.9375rem' }}>Cart empty</div>
                  <div className="empty-state-desc" style={{ fontSize: '0.8125rem' }}>Tap items to add</div>
                </div>
              )
            ) : (
              cart.map((entry, idx) => (
                <div key={idx} className="cart-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div>
                      <div className="cart-item-name">{entry.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatAmount(entry.unitPrice)} each</div>
                    </div>
                    <div style={{ fontWeight: 700 }}>{formatAmount(entry.total)}</div>
                  </div>
                  <div className="qty-stepper">
                    <button className="qty-btn" onClick={() => setCart((p) => {
                      if (entry.qty === 1) return p.filter((_, i) => i !== idx);
                      return p.map((c, i) => i === idx ? { ...c, qty: c.qty - 1, total: (c.qty - 1) * c.unitPrice } : c);
                    })}>
                      <Minus size={12} />
                    </button>
                    <span className="qty-value">{entry.qty}</span>
                    <button className="qty-btn" onClick={() => setCart((p) => p.map((c, i) => i === idx ? { ...c, qty: c.qty + 1, total: (c.qty + 1) * c.unitPrice } : c))}>
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {cart.length > 0 && (
            <div className="cart-footer">
              <div className="bill-row"><span>Subtotal</span><span className="amount">{formatAmount(subtotal)}</span></div>
              {settings.gstEnabled && <div className="bill-row"><span>GST</span><span className="amount">{formatAmount(totalGST)}</span></div>}
              <div className="bill-row total"><span>Total</span><span className="amount">{formatAmount(rounded)}</span></div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setCart([])}>Clear</button>
                <button className="btn btn-primary" style={{ flex: 2, background: '#06b6d4', borderColor: '#06b6d4' }} onClick={generateBill}>
                  <Printer size={16} /> Generate Bill
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Variant Modal */}
      {variantModal && (
        <div className="modal-overlay" onClick={() => setVariantModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className="modal-header">
              <span className="modal-title">Select Size — {variantModal.name}</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setVariantModal(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {variantModal.variants.map((v) => (
                <button
                  key={v.id}
                  className="btn btn-secondary"
                  style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3)' }}
                  onClick={() => addToCart(variantModal, v.price, v.name)}
                >
                  <span style={{ fontWeight: 600 }}>{v.name}</span>
                  <span style={{ fontWeight: 800, color: '#06b6d4' }}>{formatAmount(v.price)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Thermal Bill Print (hidden) */}
      <div style={{ display: 'none' }}>
        <div ref={printRef} className="bill-print">
          {billGenerated && (
            <>
              <div className="bill-center bill-bold bill-large">{settings.restaurantName}</div>
              <div className="bill-center" style={{ fontSize: 10 }}>{settings.address}</div>
              <div className="bill-center" style={{ fontSize: 10 }}>Ph: {settings.phone}</div>
              {settings.gstEnabled && <div className="bill-center" style={{ fontSize: 10 }}>GSTIN: {settings.gstin}</div>}
              <div className="bill-hr" />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                <span>Invoice: {billGenerated.invoiceNumber}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                <span>Date: {new Date().toLocaleDateString('en-IN')}</span>
                <span>Time: {new Date().toLocaleTimeString('en-IN', { hour12: true })}</span>
              </div>
              <div style={{ fontSize: 10 }}>Counter: Juice Counter</div>
              <div className="bill-hr" />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 10 }}>
                <span>Item</span><span>Qty</span><span>Amount</span>
              </div>
              <div className="bill-hr" />
              {billGenerated.items.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                  <span style={{ flex: 2 }}>{item.menuItemName}</span>
                  <span style={{ flex: 0, margin: '0 8px' }}>{item.quantity}</span>
                  <span style={{ flex: 1, textAlign: 'right' }}>₹{item.totalPrice.toFixed(2)}</span>
                </div>
              ))}
              <div className="bill-hr" />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}><span>Subtotal</span><span>₹{billGenerated.subtotal.toFixed(2)}</span></div>
              {settings.gstEnabled && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}><span>GST</span><span>₹{billGenerated.totalGST.toFixed(2)}</span></div>}
              <div className="bill-total-line" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span>TOTAL</span><span>₹{billGenerated.totalAmount.toFixed(2)}</span>
              </div>
              <div className="bill-hr" />
              <div className="bill-center" style={{ fontSize: 10 }}>Thank you for visiting!</div>
            </>
          )}
        </div>
      </div>

      {/* Juice KOT Print (hidden) */}
      <div style={{ display: 'none' }}>
        <div ref={kotRef} className="bill-print">
          {billGenerated && (
            <>
              <div className="bill-center bill-bold" style={{ fontSize: 14 }}>🥤 JUICE KOT</div>
              <div className="bill-center" style={{ fontSize: 10 }}>{settings.restaurantName} — Juice Counter</div>
              <div className="bill-hr" />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                <span>KOT#: {billGenerated.invoiceNumber}</span>
                <span>{new Date().toLocaleTimeString('en-IN', { hour12: true })}</span>
              </div>
              <div className="bill-hr" />
              {billGenerated.items.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 'bold', marginBottom: 6 }}>
                  <span style={{ flex: 1 }}>{item.menuItemName}</span>
                  <span style={{ marginLeft: 16 }}>× {item.quantity}</span>
                </div>
              ))}
              <div className="bill-hr" />
              <div className="bill-center" style={{ fontSize: 9 }}>— Juice Counter KOT —</div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
