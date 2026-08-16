import React, { useState } from 'react';
import { useMenuStore } from '../store/menuStore';
import { useBillStore } from '../store/billStore';
import { useSettingsStore } from '../store/settingsStore';
import { useToast } from '../store/uiStore';
import { formatAmount } from '../lib/gst';
import { Plus, Minus, Barcode, Scales, Printer, Storefront, ShoppingCart, X } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { OrderItem, Bill } from '../types';
import { calculateGSTBreakdown, gstRoundOff, generateInvoiceNumber } from '../lib/gst';
import { useReactToPrint } from 'react-to-print';
import { printReceipt, buildBillReceipt, BillPrintData } from '../lib/printer';
import { PrinterRole } from '../types';

interface CartEntry {
  menuItemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  isVeg: boolean;
  gstRate: number;
  isWeight?: boolean;
  weight?: number;
}

export default function BakeryCounter() {
  const { items, categories } = useMenuStore();
  const { addBill } = useBillStore();
  const { settings, incrementInvoiceCounter } = useSettingsStore();
  const toast = useToast();
  const bakeryCategories = categories.filter((c) => c.type === 'bakery');
  const bakeryCategoryIds = bakeryCategories.map((c) => c.id);
  const bakeryItems = items.filter((i) => i.isBakery || bakeryCategoryIds.includes(i.categoryId));

  const [cart, setCart] = useState<CartEntry[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [weightInput, setWeightInput] = useState<{ itemId: string; grams: string } | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  
  const [billGenerated, setBillGenerated] = useState<Bill | null>(null);
  const printRef = React.useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ content: () => printRef.current });

  const displayItems = bakeryItems.filter(
    (i) => (!selectedCat || i.categoryId === selectedCat) && i.available
  );

  const sendToCloudPrinter = async (role: PrinterRole) => {
    if (!billGenerated) return;
    
    const printData: BillPrintData = {
      restaurantName: settings.restaurantName,
      address: settings.address,
      gstin: settings.gstin,
      invoiceNumber: billGenerated.invoiceNumber,
      orderType: 'counter',
      staffName: 'Bakery Staff',
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
      toast.success('Cloud Print Sent', `Printing to ${role} printer...`);
    } else if (error) {
      toast.error('Print Error', error);
    }
  };

  const handleAdd = (item: typeof bakeryItems[0]) => {
    if (item.pricePerKg) {
      // Weight-based: ask for weight
      setWeightInput({ itemId: item.id, grams: '' });
      return;
    }
    const price = item.variants[0]?.price || item.basePrice;
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      if (existing) {
        return prev.map((c) => c.menuItemId === item.id ? { ...c, qty: c.qty + 1, total: (c.qty + 1) * c.unitPrice } : c);
      }
      return [...prev, { menuItemId: item.id, name: item.name, qty: 1, unitPrice: price, total: price, isVeg: item.isVeg, gstRate: item.gstRate }];
    });
  };

  const handleWeightConfirm = () => {
    if (!weightInput) return;
    const item = bakeryItems.find((i) => i.id === weightInput.itemId);
    if (!item || !item.pricePerKg) return;
    const grams = parseFloat(weightInput.grams) || 0;
    if (grams <= 0) { toast.error('Invalid weight'); return; }
    const price = Math.round((item.pricePerKg * grams) / 1000 * 100) / 100;
    setCart((prev) => [...prev, {
      menuItemId: item.id,
      name: `${item.name} (${grams}g)`,
      qty: 1,
      unitPrice: price,
      total: price,
      isVeg: item.isVeg,
      gstRate: item.gstRate,
      isWeight: true,
      weight: grams,
    }]);
    setWeightInput(null);
    toast.success('Item added', `${grams}g at ₹${price}`);
  };

  const subtotal = cart.reduce((s, c) => s + c.total, 0);
  const fakeOrderItems: OrderItem[] = cart.map((c) => ({
    id: c.menuItemId, menuItemId: c.menuItemId, menuItemName: c.name,
    addons: [], quantity: c.qty, unitPrice: c.unitPrice, totalPrice: c.total,
    isVeg: c.isVeg, gstRate: c.gstRate, status: 'pending' as const,
  }));
  const gstBreakdown = calculateGSTBreakdown(fakeOrderItems);
  const totalGST = gstBreakdown.reduce((s, g) => s + g.cgst + g.sgst, 0);
  const { rounded } = gstRoundOff(subtotal + totalGST);

  return (
    <>
      <TopBar title="Bakery Counter" />
      <div style={{ display: 'flex', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
        {/* Products */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', gap: 12, alignItems: 'center' }}>
            {/* Barcode */}
            <div className="input-with-icon" style={{ flex: 1 }}>
              <Barcode size={18} className="input-icon" />
              <input
                className="input"
                placeholder="Scan barcode or search..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
              />
            </div>
            <div className="scroll-tabs" style={{ flex: 2 }}>
              <button className={`scroll-tab ${!selectedCat ? 'active' : ''}`} onClick={() => setSelectedCat(null)}>All</button>
              {bakeryCategories.map((c) => (
                <button key={c.id} className={`scroll-tab ${selectedCat === c.id ? 'active' : ''}`} onClick={() => setSelectedCat(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4) var(--space-5)' }}>
            <div className="grid grid-menu" style={{ gap: 'var(--space-3)' }}>
              {displayItems.map((item) => (
                <div key={item.id} className="menu-item-card" onClick={() => handleAdd(item)}>
                  {item.isSpecial && (
                    <div style={{ position: 'absolute', top: 8, right: 8, background: 'var(--accent)', color: '#000', fontSize: '0.6rem', fontWeight: 800, padding: '2px 7px', borderRadius: 'var(--radius-full)' }}>
                      Special
                    </div>
                  )}
                  {item.pricePerKg && (
                    <div style={{ position: 'absolute', top: 8, left: 8 }}>
                      <Scales size={14} color="var(--text-muted)" />
                    </div>
                  )}
                  <div className="menu-item-name">{item.name}</div>
                  {item.description && <div className="menu-item-desc">{item.description}</div>}
                  <div className="menu-item-footer">
                    <div className="menu-item-price">
                      {item.pricePerKg ? `₹${item.pricePerKg}/kg` : formatAmount(item.variants[0]?.price || item.basePrice)}
                    </div>
                    <button className="menu-add-btn">
                      <Plus size={16} weight="bold" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {displayItems.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon"><Storefront size={28} /></div>
                <div className="empty-state-title">No bakery items found</div>
                <div className="empty-state-desc">Add bakery category items in Menu Management</div>
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
              <div style={{ fontWeight: 700 }}>Counter Sale</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cart.length} item{cart.length !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Storefront className="hide-on-mobile" size={20} color="var(--accent)" />
              <button className="mobile-cart-close" onClick={() => setIsCartOpen(false)}>
                <X size={16} weight="bold" />
              </button>
            </div>
          </div>

          <div className="cart-items">
            {cart.length === 0 ? (
              billGenerated ? (
                <div className="empty-state" style={{ padding: 'var(--space-6)', background: 'var(--status-free-dim)', border: '1px solid var(--status-free)', margin: 'var(--space-4)' }}>
                  <div className="empty-state-icon" style={{ width: 64, height: 64, background: 'var(--status-free)', color: 'white', marginBottom: 'var(--space-4)' }}>
                    <Printer size={32} />
                  </div>
                  <div className="empty-state-title" style={{ fontSize: '1.25rem', color: 'var(--status-free)' }}>Bill Generated!</div>
                  <div className="empty-state-desc" style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-4)' }}>{billGenerated.invoiceNumber}</div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginBottom: 12 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Print to:</div>
                    {(settings.printers || []).filter(p => p.enabled).map(p => (
                      <button key={p.id} className="btn btn-primary" onClick={() => sendToCloudPrinter(p.role)}>
                        🖨️ {p.name}
                      </button>
                    ))}
                    <button className="btn btn-secondary" onClick={() => handlePrint()}>
                      📄 Browser Print
                    </button>
                  </div>

                  <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setBillGenerated(null)}>
                    New Order
                  </button>
                </div>
              ) : (
                <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
                  <div className="empty-state-icon" style={{ width: 48, height: 48 }}><Storefront size={24} /></div>
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
              <div className="bill-row"><span>GST</span><span className="amount">{formatAmount(totalGST)}</span></div>
              <div className="bill-row total"><span>Total</span><span className="amount">{formatAmount(rounded)}</span></div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setCart([])}>Clear</button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  onClick={() => {
                    if (!window.confirm('Generate and save bill for these items?')) return;
                    
                    const counter = incrementInvoiceCounter();
                    const invoiceNumber = generateInvoiceNumber(settings.invoicePrefix, counter);
                    
                    const mappedItems: OrderItem[] = cart.map(c => ({
                      id: crypto.randomUUID(),
                      menuItemId: c.menuItemId,
                      menuItemName: c.name,
                      quantity: c.qty,
                      unitPrice: c.unitPrice,
                      totalPrice: c.total,
                      status: 'served',
                      addons: [],
                      isVeg: c.isVeg,
                      gstRate: c.gstRate
                    }));

                    const roundOff = rounded - (subtotal + totalGST);

                    const newBill: Bill = {
                      id: crypto.randomUUID(),
                      invoiceNumber,
                      orderId: crypto.randomUUID(),
                      orderType: 'takeaway',
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
                      staffName: 'Bakery Staff',
                      createdAt: new Date(),
                      outletName: settings.restaurantName,
                      outletAddress: settings.address,
                      outletGSTIN: settings.gstin,
                    };

                    addBill(newBill);
                    setBillGenerated(newBill);
                    toast.success('Bill Generated', `Invoice ${invoiceNumber} created`);
                    setCart([]);
                  }}
                >
                  <Printer size={16} /> Generate Bill
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Weight Modal */}
      {weightInput && (
        <div className="modal-overlay" onClick={() => setWeightInput(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className="modal-header">
              <span className="modal-title"><Scales size={18} style={{ display: 'inline', marginRight: 8 }} />Enter Weight</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setWeightInput(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label className="input-label">Weight in grams</label>
                <input
                  className="input"
                  type="number"
                  placeholder="e.g., 250"
                  value={weightInput.grams}
                  onChange={(e) => setWeightInput({ ...weightInput, grams: e.target.value })}
                  autoFocus
                />
              </div>
              {weightInput.grams && (() => {
                const item = bakeryItems.find((i) => i.id === weightInput.itemId);
                if (!item?.pricePerKg) return null;
                const price = Math.round((item.pricePerKg * parseFloat(weightInput.grams || '0')) / 1000 * 100) / 100;
                return (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--accent-dim)', borderRadius: 'var(--radius-md)', border: '1px solid var(--accent-dim-hover)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Price</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent)' }}>{formatAmount(price)}</div>
                  </div>
                );
              })()}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setWeightInput(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleWeightConfirm}>Add to Cart</button>
            </div>
          </div>
        </div>
      )}

      {/* Thermal Print Template (hidden) */}
      <div style={{ display: 'none' }}>
        <div ref={printRef} className="bill-print">
          {billGenerated && (
            <>
              <div className="bill-center bill-bold bill-large">{settings.restaurantName}</div>
              <div className="bill-center" style={{ fontSize: 10 }}>{settings.address}</div>
              <div className="bill-center" style={{ fontSize: 10 }}>Ph: {settings.phone}</div>
              <div className="bill-center" style={{ fontSize: 10 }}>GSTIN: {settings.gstin}</div>
              <div className="bill-hr" />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Invoice: {billGenerated.invoiceNumber}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                <span>Date: {new Date().toLocaleDateString('en-IN')}</span>
                <span>Time: {new Date().toLocaleTimeString('en-IN', { hour12: true })}</span>
              </div>
              <div style={{ fontSize: 10 }}>Table: Takeaway (Bakery)</div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}><span>GST</span><span>₹{billGenerated.totalGST.toFixed(2)}</span></div>
              {billGenerated.roundOff !== 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}><span>Round Off</span><span>₹{billGenerated.roundOff.toFixed(2)}</span></div>}
              <div className="bill-total-line" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span>TOTAL</span><span>₹{billGenerated.totalAmount.toFixed(2)}</span>
              </div>
              <div className="bill-hr" />
              <div className="bill-center" style={{ fontSize: 10 }}>Thank you for visiting!</div>
              <div className="bill-center" style={{ fontSize: 9 }}>www.appricots.com</div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
