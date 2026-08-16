import React, { useState } from 'react';
import { formatAmount } from '../lib/gst';
import { Package, Warning, Plus, ArrowDown, ArrowUp, PencilSimple, X } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { Ingredient, PurchaseEntry } from '../types';
import { useInventoryStore } from '../store/inventoryStore';
import { useToast } from '../store/uiStore';

type IngredientWithCat = Ingredient & { category: string };

const UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'dozen', 'packet'];
const CATEGORIES = ['Meat', 'Dairy', 'Vegetables', 'Fruits', 'Grains', 'Seafood', 'Pantry', 'Beverages', 'Other'];

const emptyIngredient = (): Omit<IngredientWithCat, 'id'> => ({
  name: '',
  unit: 'kg',
  currentStock: 0,
  reorderLevel: 0,
  costPerUnit: 0,
  vendorName: '',
  category: 'Other',
});

export default function Inventory() {
  const { ingredients, purchaseEntries, addIngredient, updateIngredient, addPurchaseEntry } = useInventoryStore();
  const toast = useToast();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [activeTab, setActiveTab] = useState<'stock' | 'purchases'>('stock');

  // Edit ingredient modal
  const [editingIngredient, setEditingIngredient] = useState<Partial<IngredientWithCat> | null>(null);
  const [isNewIngredient, setIsNewIngredient] = useState(false);

  // Purchase entry modal
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({
    ingredientId: '',
    quantity: '',
    costPerUnit: '',
    vendorName: '',
    invoiceRef: '',
    date: new Date().toISOString().split('T')[0],
  });

  const cats = ['All', ...Array.from(new Set(ingredients.map((i) => i.category)))];
  const filtered = selectedCategory === 'All' ? ingredients : ingredients.filter((i) => i.category === selectedCategory);
  const lowStock = ingredients.filter((i) => i.currentStock <= i.reorderLevel);
  const criticalStock = ingredients.filter((i) => i.currentStock === 0);

  const getStockLevel = (current: number, reorder: number): 'good' | 'low' | 'critical' => {
    if (current === 0) return 'critical';
    if (current <= reorder) return 'low';
    return 'good';
  };

  const openAdd = () => {
    setEditingIngredient(emptyIngredient());
    setIsNewIngredient(true);
  };

  const openEdit = (ing: IngredientWithCat) => {
    setEditingIngredient({ ...ing });
    setIsNewIngredient(false);
  };

  const handleSaveIngredient = () => {
    if (!editingIngredient?.name) { toast.error('Name required'); return; }
    if (isNewIngredient) {
      addIngredient(editingIngredient as Omit<IngredientWithCat, 'id'>);
      toast.success('Ingredient Added', editingIngredient.name);
    } else if (editingIngredient.id) {
      updateIngredient(editingIngredient.id, editingIngredient);
      toast.success('Ingredient Updated', editingIngredient.name);
    }
    setEditingIngredient(null);
  };

  const handleAddPurchase = () => {
    if (!purchaseForm.ingredientId || !purchaseForm.quantity) {
      toast.error('Fill required fields', 'Select ingredient and quantity');
      return;
    }
    const ing = ingredients.find((i) => i.id === purchaseForm.ingredientId);
    if (!ing) return;
    const qty = parseFloat(purchaseForm.quantity);
    const cost = parseFloat(purchaseForm.costPerUnit) || ing.costPerUnit;
    addPurchaseEntry({
      ingredientId: ing.id,
      ingredientName: ing.name,
      quantity: qty,
      costPerUnit: cost,
      totalCost: qty * cost,
      vendorName: purchaseForm.vendorName || ing.vendorName || '',
      date: new Date(purchaseForm.date),
      invoiceRef: purchaseForm.invoiceRef || undefined,
    });
    toast.success('Purchase Recorded', `Added ${qty} ${ing.unit} of ${ing.name}`);
    setPurchaseForm({ ingredientId: '', quantity: '', costPerUnit: '', vendorName: '', invoiceRef: '', date: new Date().toISOString().split('T')[0] });
    setShowPurchaseModal(false);
  };

  return (
    <>
      <TopBar title="Inventory Management" actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowPurchaseModal(true)}>
            <ArrowDown size={16} /> Purchase Entry
          </button>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>
            <Plus size={16} /> Add Ingredient
          </button>
        </div>
      } />
      <div className="page-body">
        {/* Low Stock Alert */}
        {lowStock.length > 0 && (
          <div style={{ background: 'var(--status-reserved-bg)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4) var(--space-5)', marginBottom: 'var(--space-5)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Warning size={20} color="var(--status-reserved)" />
            <div>
              <div style={{ fontWeight: 700, color: 'var(--status-reserved)' }}>Low Stock Alert</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {lowStock.map((i) => i.name).join(', ')} are below reorder level
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-4" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
          <div className="stat-card green">
            <div className="stat-icon green"><Package size={20} /></div>
            <div className="stat-value">{ingredients.length}</div>
            <div className="stat-label">Total Ingredients</div>
          </div>
          <div className="stat-card accent">
            <div className="stat-icon accent"><ArrowUp size={20} /></div>
            <div className="stat-value">{ingredients.filter((i) => getStockLevel(i.currentStock, i.reorderLevel) === 'good').length}</div>
            <div className="stat-label">Well Stocked</div>
          </div>
          <div className="stat-card" style={{ background: 'var(--status-reserved-bg)' }}>
            <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--status-reserved)' }}><Warning size={20} /></div>
            <div className="stat-value" style={{ color: 'var(--status-reserved)' }}>{lowStock.length}</div>
            <div className="stat-label">Low Stock</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon red"><Warning size={20} /></div>
            <div className="stat-value" style={{ color: 'var(--status-occupied)' }}>{criticalStock.length}</div>
            <div className="stat-label">Out of Stock</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs" style={{ marginBottom: 'var(--space-4)', padding: 4, display: 'inline-flex' }}>
          <button className={`tab-item ${activeTab === 'stock' ? 'active' : ''}`} onClick={() => setActiveTab('stock')}>Stock Levels</button>
          <button className={`tab-item ${activeTab === 'purchases' ? 'active' : ''}`} onClick={() => setActiveTab('purchases')}>Purchase History ({purchaseEntries.length})</button>
        </div>

        {activeTab === 'stock' && (
          <>
            {/* Category filter */}
            <div className="scroll-tabs" style={{ marginBottom: 'var(--space-4)' }}>
              {cats.map((c) => (
                <button key={c} className={`scroll-tab ${selectedCategory === c ? 'active' : ''}`} onClick={() => setSelectedCategory(c)}>{c}</button>
              ))}
            </div>

            <div className="card">
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ingredient</th>
                      <th>Category</th>
                      <th>Stock</th>
                      <th>Unit</th>
                      <th>Reorder Level</th>
                      <th>Cost/Unit</th>
                      <th>Vendor</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((ing) => {
                      const level = getStockLevel(ing.currentStock, ing.reorderLevel);
                      const pct = Math.min(100, Math.round((ing.currentStock / Math.max(ing.reorderLevel * 3, 1)) * 100));
                      return (
                        <tr key={ing.id}>
                          <td style={{ fontWeight: 600 }}>{ing.name}</td>
                          <td><span className="badge badge-muted">{ing.category}</span></td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div className="stock-level-bar" style={{ width: 80 }}>
                                <div className={`stock-level-fill ${level}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: '0.9375rem' }}>{ing.currentStock}</span>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-muted)' }}>{ing.unit}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{ing.reorderLevel} {ing.unit}</td>
                          <td style={{ fontWeight: 600 }}>{formatAmount(ing.costPerUnit)}/{ing.unit}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{ing.vendorName}</td>
                          <td>
                            <span className={`badge badge-${level === 'good' ? 'free' : level === 'low' ? 'reserved' : 'occupied'}`}>
                              {level === 'good' ? 'Good' : level === 'low' ? 'Low' : 'Out'}
                            </span>
                          </td>
                          <td>
                            <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={() => openEdit(ing)}>
                              <PencilSimple size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === 'purchases' && (
          <div className="card">
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Ingredient</th>
                    <th>Quantity</th>
                    <th>Cost/Unit</th>
                    <th>Total Cost</th>
                    <th>Vendor</th>
                    <th>Invoice Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseEntries.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontSize: '0.875rem' }}>{new Date(p.date).toLocaleDateString('en-IN')}</td>
                      <td style={{ fontWeight: 600 }}>{p.ingredientName}</td>
                      <td>{p.quantity}</td>
                      <td>{formatAmount(p.costPerUnit)}</td>
                      <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{formatAmount(p.totalCost)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{p.vendorName}</td>
                      <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.invoiceRef || '—'}</td>
                    </tr>
                  ))}
                  {purchaseEntries.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>No purchases recorded yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Edit/Add Ingredient Modal */}
      {editingIngredient && (
        <div className="modal-overlay" onClick={() => setEditingIngredient(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <span className="modal-title">{isNewIngredient ? 'Add New Ingredient' : `Edit — ${editingIngredient.name}`}</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditingIngredient(null)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Ingredient Name *</label>
                <input className="input" value={editingIngredient.name || ''} onChange={(e) => setEditingIngredient({ ...editingIngredient, name: e.target.value })} placeholder="e.g., Chicken" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="input-group">
                  <label className="input-label">Category</label>
                  <select className="input select" value={editingIngredient.category || 'Other'} onChange={(e) => setEditingIngredient({ ...editingIngredient, category: e.target.value })}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Unit</label>
                  <select className="input select" value={editingIngredient.unit || 'kg'} onChange={(e) => setEditingIngredient({ ...editingIngredient, unit: e.target.value })}>
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="input-group">
                  <label className="input-label">Current Stock</label>
                  <input className="input" type="number" value={editingIngredient.currentStock ?? ''} onChange={(e) => setEditingIngredient({ ...editingIngredient, currentStock: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="input-group">
                  <label className="input-label">Reorder Level</label>
                  <input className="input" type="number" value={editingIngredient.reorderLevel ?? ''} onChange={(e) => setEditingIngredient({ ...editingIngredient, reorderLevel: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="input-group">
                  <label className="input-label">Cost per Unit (₹)</label>
                  <input className="input" type="number" value={editingIngredient.costPerUnit ?? ''} onChange={(e) => setEditingIngredient({ ...editingIngredient, costPerUnit: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Vendor Name</label>
                <input className="input" value={editingIngredient.vendorName || ''} onChange={(e) => setEditingIngredient({ ...editingIngredient, vendorName: e.target.value })} placeholder="Supplier name" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingIngredient(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveIngredient}>
                {isNewIngredient ? 'Add Ingredient' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Entry Modal */}
      {showPurchaseModal && (
        <div className="modal-overlay" onClick={() => setShowPurchaseModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <span className="modal-title"><ArrowDown size={18} style={{ display: 'inline', marginRight: 8 }} />New Purchase Entry</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowPurchaseModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Ingredient *</label>
                <select className="input select" value={purchaseForm.ingredientId} onChange={(e) => {
                  const ing = ingredients.find(i => i.id === e.target.value);
                  setPurchaseForm({ ...purchaseForm, ingredientId: e.target.value, costPerUnit: ing ? String(ing.costPerUnit) : '', vendorName: ing?.vendorName || '' });
                }}>
                  <option value="">— Select Ingredient —</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="input-group">
                  <label className="input-label">Quantity *</label>
                  <input className="input" type="number" placeholder="Amount received" value={purchaseForm.quantity} onChange={(e) => setPurchaseForm({ ...purchaseForm, quantity: e.target.value })} />
                </div>
                <div className="input-group">
                  <label className="input-label">Cost per Unit (₹)</label>
                  <input className="input" type="number" value={purchaseForm.costPerUnit} onChange={(e) => setPurchaseForm({ ...purchaseForm, costPerUnit: e.target.value })} />
                </div>
              </div>

              {purchaseForm.ingredientId && purchaseForm.quantity && purchaseForm.costPerUnit && (
                <div style={{ padding: '10px 14px', background: 'var(--accent-dim)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Total Cost</span>
                  <span style={{ fontWeight: 800, color: 'var(--accent)' }}>
                    {formatAmount(parseFloat(purchaseForm.quantity) * parseFloat(purchaseForm.costPerUnit))}
                  </span>
                </div>
              )}

              <div className="input-group">
                <label className="input-label">Vendor Name</label>
                <input className="input" value={purchaseForm.vendorName} onChange={(e) => setPurchaseForm({ ...purchaseForm, vendorName: e.target.value })} placeholder="Supplier name" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="input-group">
                  <label className="input-label">Date</label>
                  <input className="input" type="date" value={purchaseForm.date} onChange={(e) => setPurchaseForm({ ...purchaseForm, date: e.target.value })} />
                </div>
                <div className="input-group">
                  <label className="input-label">Invoice Ref</label>
                  <input className="input" value={purchaseForm.invoiceRef} onChange={(e) => setPurchaseForm({ ...purchaseForm, invoiceRef: e.target.value })} placeholder="Optional" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPurchaseModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddPurchase}>
                <ArrowDown size={16} /> Record Purchase
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
