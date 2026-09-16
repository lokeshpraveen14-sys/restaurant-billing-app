import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useMenuStore } from '../store/menuStore';
import { useOrderStore } from '../store/orderStore';
import { useTableStore } from '../store/tableStore';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../store/uiStore';
import { useInventoryStore } from '../store/inventoryStore';
import { MenuItem, OrderItem, OrderType } from '../types';
import {
  MagnifyingGlass, Plus, Minus, Trash, Printer, ClipboardText,
  Note, CheckCircle, ForkKnife, ShoppingCart, X
} from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { formatAmount } from '../lib/gst';
import { useSettingsStore } from '../store/settingsStore';
import { printReceipt, buildKotReceipt } from '../lib/printer';

export default function OrderTaking() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tableId = searchParams.get('table') || undefined;
  const orderIdParam = searchParams.get('orderId') || undefined;
  const guestsParam = searchParams.get('guests');
  const initialGuestCount = guestsParam ? parseInt(guestsParam) : undefined;
  const seatsParam = searchParams.get('seats');
  const initialSeats = seatsParam ? seatsParam.split(',').map(s => parseInt(s)).filter(s => !isNaN(s)) : undefined;

  const categories = useMenuStore(s => s.categories);
  const items = useMenuStore(s => s.items);
  const searchQuery = useMenuStore(s => s.searchQuery);
  const selectedCategoryId = useMenuStore(s => s.selectedCategoryId);
  const setSearch = useMenuStore(s => s.setSearch);
  const setCategory = useMenuStore(s => s.setCategory);
  const getFilteredItems = useMenuStore(s => s.getFilteredItems);
  
  const orders = useOrderStore(s => s.orders);
  const createOrder = useOrderStore(s => s.createOrder);
  const addItemToOrder = useOrderStore(s => s.addItemToOrder);
  const removeItemFromOrder = useOrderStore(s => s.removeItemFromOrder);
  const updateItemQty = useOrderStore(s => s.updateItemQty);
  const submitKOT = useOrderStore(s => s.submitKOT);
  const getOrdersByTable = useOrderStore(s => s.getOrdersByTable);
  const activeOrder = useOrderStore(s => s.activeOrder);
  const setActiveOrder = useOrderStore(s => s.setActiveOrder);
  const ordersLoaded = useOrderStore(s => s.ordersLoaded);
  const voidOrder = useOrderStore(s => s.voidOrder);
  
  const tables = useTableStore(s => s.tables);
  const updateTableStatus = useTableStore(s => s.updateTableStatus);
  const currentUser = useAuthStore(s => s.currentUser);
  const ingredients = useInventoryStore(s => s.ingredients);
  const settings = useSettingsStore(s => s.settings);
  const toast = useToast();

  const [orderType, setOrderType] = useState<OrderType>(tableId ? 'dine-in' : 'takeaway');
  const [noteModal, setNoteModal] = useState<{ itemId: string; value: string } | null>(null);
  const [variantModal, setVariantModal] = useState<MenuItem | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [printerModal, setPrinterModal] = useState(false);

  const table = tables.find((t) => t.id === tableId);

  const isNewBill = searchParams.get('new') === 'true';

  // Restore existing order for this table immediately from cache (localStorage)
  // Then sync with DB once loaded
  useEffect(() => {
    if (!currentUser) return;

    // If new=true is passed, force a fresh order.
    if (isNewBill) {
      // Wait until orders are loaded before creating — prevents double-creation race.
      if (!ordersLoaded || !tableId) return;
      const newOrder = createOrder(tableId, table?.number, orderType, currentUser.id, currentUser.name, initialGuestCount, initialSeats);
      setActiveOrder(newOrder);
      // Replace URL with the new order's ID so re-renders stay on this order.
      // Removing 'new' and locking in orderId prevents falling through to the first order on the table.
      searchParams.delete('new');
      searchParams.set('orderId', newOrder.id);
      navigate(`?${searchParams.toString()}`, { replace: true });
      return;
    }

    // If a specific orderId was requested (e.g. from the sub-table modal), load ONLY that order.
    if (orderIdParam) {
      const targetOrder = orders.find(o => o.id === orderIdParam);
      if (targetOrder) {
        setActiveOrder(targetOrder);
        return;
      }
      // Not found yet — wait for DB load (ordersLoaded re-run will try again).
      return;
    }

    // No specific order requested — find or create one for this table.
    const existing = tableId ? getOrdersByTable(tableId, table?.number)[0] : null;
    if (existing) {
      setActiveOrder(existing);
    } else if (ordersLoaded && tableId) {
      // DB loaded and no order found — create a new one
      const newOrder = createOrder(tableId, table?.number, orderType, currentUser.id, currentUser.name, initialGuestCount, initialSeats);
      setActiveOrder(newOrder);
    }
    // If not loaded yet, the next render after ordersLoaded=true will re-run this
  }, [tableId, orderIdParam, ordersLoaded, isNewBill]);

  // Auto-cleanup: if the user navigates away without adding anything, delete the empty order
  useEffect(() => {
    return () => {
      const order = useOrderStore.getState().activeOrder;
      if (order && order.items.filter(i => i.status !== 'void').length === 0) {
        voidOrder(order.id, 'Auto-released: no items added');
        // If this was the only order on the table, reset table to free
        const remaining = useOrderStore.getState().orders.filter(
          o => o.tableId === order.tableId && o.id !== order.id && ['open', 'kot_sent', 'preparing', 'ready'].includes(o.status)
        );
        if (remaining.length === 0 && order.tableId) {
          useTableStore.getState().updateTableStatus(order.tableId, 'free');
        }
      }
      useOrderStore.getState().setActiveOrder(null);
    };
  }, []);

  const filteredItems = getFilteredItems();

  const handleAddItem = (menuItem: MenuItem) => {
    let currentOrder = activeOrder;
    if (!currentOrder) {
      if (orderType === 'dine-in') {
        toast.error('No table selected', 'Please select a table first');
        return;
      }
      currentOrder = createOrder(tableId, table?.number, orderType, currentUser?.id || '', currentUser?.name || '', initialGuestCount, initialSeats);
      setActiveOrder(currentOrder);
    }

    if (tableId && table?.status === 'free') {
      updateTableStatus(tableId, 'occupied');
    }

    if (menuItem.variants && menuItem.variants.length > 1) {
      setVariantModal(menuItem);
      return;
    }

    addVariantToCart(menuItem, menuItem.variants?.[0] || null, currentOrder);
  };

  const addVariantToCart = (menuItem: MenuItem, variant: any, targetOrder = activeOrder) => {
    const price = variant ? variant.price : menuItem.basePrice;

    // Determine kotType based on category
    const cat = categories.find((c) => c.id === menuItem.categoryId);
    const kotType: 'food' | 'juice' | 'bakery' = 
      cat?.type === 'juice' ? 'juice' :
      cat?.type === 'bakery' ? 'bakery' : 'food';

    const existingItem = targetOrder?.items.find(
      (i) => i.menuItemId === menuItem.id && i.variantId === variant?.id && i.status !== 'void'
    );

    if (existingItem && targetOrder) {
      updateItemQty(targetOrder.id, existingItem.id, existingItem.quantity + 1);
    } else if (targetOrder) {
      const newItem: Omit<OrderItem, 'id' | 'status'> = {
        menuItemId: menuItem.id,
        menuItemName: menuItem.name,
        variantId: variant?.id,
        variantName: variant?.name,
        addons: [],
        quantity: 1,
        unitPrice: price,
        totalPrice: price,
        isVeg: menuItem.isVeg,
        gstRate: menuItem.gstRate,
        kotType,
      };
      addItemToOrder(targetOrder.id, newItem);
    }
    
    setVariantModal(null);
  };


  const handleKOT = () => {
    if (!activeOrder || activeOrder.items.length === 0) {
      toast.error('No items', 'Add items to the order first');
      return;
    }
    setPrinterModal(true);
  };

  const handlePrintKOT = async (printerId: string) => {
    if (!activeOrder) return;

    // 1. Find items that have unprinted quantities
    const newItemsToPrint = activeOrder.items
      .filter(i => i.status !== 'void' && i.quantity > (i.printedQuantity || 0))
      .map(i => ({
        menuItemName: i.menuItemName,
        // Calculate delta: only print the newly added amount
        quantity: i.quantity - (i.printedQuantity || 0),
        note: i.note
      }));

    if (newItemsToPrint.length === 0) {
      toast.warning('No new items', 'There are no new items to send to the kitchen.');
      setPrinterModal(false);
      return;
    }

    // 2. Submit KOT (this updates printedQuantity in store and syncs to DB)
    submitKOT(activeOrder.id);
    setPrinterModal(false);
    toast.success('KOT Sent', 'Kitchen Order Ticket sent to kitchen');

    // 3. Print receipt with only the new items
    const data = {
      orderId: (activeOrder.localId || activeOrder.id).slice(0, 8).toUpperCase(),
      tableNumber: table?.number,
      orderType: orderType,
      staffName: currentUser?.name,
      items: newItemsToPrint
    };
    
    const lines = buildKotReceipt(data);
    const result = await printReceipt(lines, printerId);
    if (!result.success) {
      toast.error('Print Failed', result.error || 'Unknown error');
    }
  };

  const handleBill = () => {
    if (!activeOrder) return;
    navigate(`/billing?order=${activeOrder.id}`);
  };

  const cartItems = activeOrder?.items.filter((i) => i.status !== 'void') || [];
  const subtotal = cartItems.reduce((sum, i) => sum + (i.totalPrice || 0), 0);

  // Show loading state while fetching orders from DB after a page refresh
  if (!ordersLoaded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16 }}>
        <div className="spinner" style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading order...</div>
      </div>
    );
  }

  return (
    <>
      <TopBar
        title={table ? `Order — Table ${table.number}` : 'New Order'}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {table && cartItems.length === 0 && (
              <button 
                className="btn btn-ghost btn-sm" 
                style={{ color: 'var(--status-occupied)' }}
                onClick={() => {
                  updateTableStatus(table.id, 'free');
                  navigate('/tables');
                  toast.success('Table Released', 'Table marked as free');
                }}
              >
                Release Table
              </button>
            )}
            <div className="tabs" style={{ padding: 3 }}>
              {(['dine-in', 'takeaway', 'counter'] as OrderType[]).map((t) => (
                <button
                  key={t}
                  className={`tab-item ${orderType === t ? 'active' : ''}`}
                  onClick={() => setOrderType(t)}
                  style={{ padding: '6px 12px', fontSize: '0.8125rem', textTransform: 'capitalize' }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div style={{ display: 'flex', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
        {/* Menu Panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Search + Categories */}
          <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
            <div className="input-with-icon" style={{ marginBottom: 12 }}>
              <MagnifyingGlass size={18} className="input-icon" />
              <input
                className="input"
                type="search"
                placeholder="Search menu items..."
                value={searchQuery}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="scroll-tabs">
              <button
                className={`scroll-tab ${!selectedCategoryId ? 'active' : ''}`}
                onClick={() => setCategory(null)}
              >
                All
              </button>
              {categories.filter((c) => c.active).sort((a, b) => a.sortOrder - b.sortOrder).map((cat) => (
                <button
                  key={cat.id}
                  className={`scroll-tab ${selectedCategoryId === cat.id ? 'active' : ''}`}
                  onClick={() => setCategory(cat.id)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Menu Grid */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4) var(--space-5)' }}>
            <div className="grid grid-menu" style={{ gap: 'var(--space-3)' }}>
              {filteredItems.map((item) => {
                const inCart = cartItems.find((c) => c.menuItemId === item.id);
                return (() => {
                  const stockLevel = item.stockQuantity !== undefined 
                    ? item.stockQuantity === 0 ? 'out'
                      : item.stockQuantity <= 5 ? 'low'
                      : 'good'
                    : 'good';

                  return (
                  <div
                    key={item.id}
                    className={`menu-item-card ${!item.available ? 'unavailable' : ''}`}
                    onClick={() => item.available && handleAddItem(item)}
                  >
                    {item.isSpecial && (
                      <div style={{
                        position: 'absolute', top: 8, right: 8,
                        background: 'var(--accent)', color: '#000',
                        fontSize: '0.6rem', fontWeight: 800, padding: '2px 7px',
                        borderRadius: 'var(--radius-full)', letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}>
                        Special
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                      <div className={`veg-dot ${item.isVeg ? 'veg' : 'nonveg'}`} style={{ marginTop: 2 }} />
                      <div className="menu-item-name" style={{ flex: 1 }}>{item.name}</div>
                    </div>
                    {item.description && <div className="menu-item-desc">{item.description}</div>}
                    {/* Stock status badge */}
                    {stockLevel !== 'good' && (
                      <div style={{ marginBottom: 4 }}>
                        <span style={{
                          fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                          background: stockLevel === 'out' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                          color: stockLevel === 'out' ? '#ef4444' : '#f59e0b',
                        }}>
                          {stockLevel === 'out' ? '⚠ Out of Stock' : `⚡ Only ${item.stockQuantity} Left`}
                        </span>
                      </div>
                    )}
                    <div className="menu-item-footer">
                      <div>
                        <div className="menu-item-price">
                          {item.pricePerKg ? `₹${item.pricePerKg}/kg` : formatAmount(item.variants[0]?.price || item.basePrice)}
                        </div>
                        {item.variants.length > 1 && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>+{item.variants.length - 1} variants</div>
                        )}
                      </div>
                      {item.available ? (
                        inCart ? (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: 'var(--accent)', color: '#000',
                            borderRadius: 'var(--radius-full)', padding: '2px',
                          }}>
                            <button 
                              style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', color: '#000' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (inCart.quantity === 1) removeItemFromOrder(activeOrder!.id, inCart.id);
                                else updateItemQty(activeOrder!.id, inCart.id, inCart.quantity - 1);
                              }}
                            >
                              <Minus size={12} weight="bold" />
                            </button>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, minWidth: 12, textAlign: 'center' }}>
                              {inCart.quantity}
                            </span>
                            <button 
                              style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', color: '#000' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                updateItemQty(activeOrder!.id, inCart.id, inCart.quantity + 1);
                              }}
                            >
                              <Plus size={12} weight="bold" />
                            </button>
                          </div>
                        ) : (
                          <button className="menu-add-btn">
                            <Plus size={16} weight="bold" />
                          </button>
                        )
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: 'var(--status-occupied)', fontWeight: 600 }}>86'd</span>
                      )}
                    </div>
                  </div>
                  );
                })();
              })}
            </div>

            {filteredItems.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon"><ForkKnife size={32} /></div>
                <div className="empty-state-title">No items found</div>
                <div className="empty-state-desc">Try a different search or category</div>
              </div>
            )}
            
            <div className="mobile-cart-fab" onClick={() => setIsCartOpen(true)}>
              <ShoppingCart size={24} weight="fill" />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <span style={{ fontSize: '0.85rem' }}>View Cart</span>
                <span style={{ fontSize: '0.7rem', color: 'rgba(0,0,0,0.7)' }}>{cartItems.length} items · {formatAmount(subtotal)}</span>
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

        {/* Cart Panel */}
        <div className={`cart-panel ${isCartOpen ? 'cart-open' : ''}`}>
          <div className="cart-header">
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>
                {table ? `Table ${table.number}` : 'Order Cart'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {cartItems.length} item{cartItems.length !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {activeOrder?.status === 'kot_sent' && (
                <span className="badge badge-billing">KOT Sent</span>
              )}
              <button className="mobile-cart-close" onClick={() => setIsCartOpen(false)}>
                <X size={16} weight="bold" />
              </button>
            </div>
          </div>

          {/* Items */}
          <div className="cart-items">
            {cartItems.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
                <div className="empty-state-icon" style={{ width: 56, height: 56 }}>
                  <ClipboardText size={28} />
                </div>
                <div className="empty-state-title" style={{ fontSize: '1rem' }}>Cart is empty</div>
                <div className="empty-state-desc" style={{ fontSize: '0.8125rem' }}>Tap menu items to add</div>
              </div>
            ) : (
              cartItems.map((item) => (
                <div key={item.id} className="cart-item">
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                      <div className={`veg-dot ${item.isVeg ? 'veg' : 'nonveg'}`} style={{ marginTop: 2, flexShrink: 0 }} />
                      <div>
                        <div className="cart-item-name">{item.menuItemName}</div>
                        {item.variantName && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.variantName}</div>}
                        {item.note && <div className="cart-item-note">"{item.note}"</div>}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.9375rem', fontWeight: 700 }}>{formatAmount(item.totalPrice)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="qty-stepper">
                      <button className="qty-btn" onClick={() => updateItemQty(activeOrder!.id, item.id, item.quantity - 1)}>
                        {item.quantity === 1 ? <Trash size={12} /> : <Minus size={12} />}
                      </button>
                      <span className="qty-value">{item.quantity}</span>
                      <button className="qty-btn" onClick={() => updateItemQty(activeOrder!.id, item.id, item.quantity + 1)}>
                        <Plus size={12} />
                      </button>
                    </div>
                    <button
                      onClick={() => setNoteModal({ itemId: item.id, value: item.note || '' })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Note size={14} /> Note
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Bill Summary */}
          {cartItems.length > 0 && (
            <div className="cart-footer">
              <div className="bill-row">
                <span>Subtotal</span>
                <span className="amount">{formatAmount(subtotal)}</span>
              </div>
              <div className="bill-row">
                <span>GST (est.)</span>
                <span className="amount">{formatAmount(subtotal * 0.05)}</span>
              </div>
              <div className="bill-row total">
                <span>Total</span>
                <span className="amount">{formatAmount(subtotal * 1.05)}</span>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handleKOT}>
                  <Printer size={16} /> KOT
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { handleBill(); setIsCartOpen(false); }}>
                  <CheckCircle size={16} /> Bill
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Note Modal */}
      {noteModal && (
        <div className="modal-overlay" onClick={() => setNoteModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Item Note</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setNoteModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <input
                className="input"
                placeholder="e.g., no onion, less spicy, extra sauce..."
                value={noteModal.value}
                onChange={(e) => setNoteModal({ ...noteModal, value: e.target.value })}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setNoteModal(null)}>Cancel</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  // updateItemNote(activeOrder!.id, noteModal.itemId, noteModal.value);
                  setNoteModal(null);
                  toast.success('Note added');
                }}
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Variant Modal */}
      {variantModal && (
        <div className="modal-overlay" onClick={() => setVariantModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Select Variant for {variantModal.name}</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setVariantModal(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {variantModal.variants.map((v) => (
                <button
                  key={v.id}
                  className="btn btn-secondary"
                  style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3)' }}
                  onClick={() => addVariantToCart(variantModal, v)}
                >
                  <span style={{ fontWeight: 600 }}>{v.name}</span>
                  <span style={{ fontWeight: 800, color: 'var(--accent)' }}>{formatAmount(v.price)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Printer Modal */}
      {printerModal && (
        <div className="modal-overlay" onClick={() => setPrinterModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Select Printer for KOT</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setPrinterModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {settings.printers?.filter(p => p.enabled !== false).length > 0 ? (
                settings.printers.filter(p => p.enabled !== false).map((p) => (
                  <button
                    key={p.id}
                    className="btn btn-secondary"
                    style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3)' }}
                    onClick={() => handlePrintKOT(p.id)}
                  >
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{p.role}</span>
                  </button>
                ))
              ) : (
                <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No printers configured. Please add one in Settings.
                  <br/><br/>
                  <button className="btn btn-primary" onClick={() => handlePrintKOT('kot')} style={{ marginTop: 12 }}>
                    Send KOT without printing
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
