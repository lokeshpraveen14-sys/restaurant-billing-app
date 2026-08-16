import React, { useState } from 'react';
import { useMenuStore } from '../store/menuStore';
import { useToast } from '../store/uiStore';
import { MenuItem } from '../types';
import { Plus, ToggleLeft, ToggleRight, PencilSimple, MagnifyingGlass, ForkKnife } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { formatAmount } from '../lib/gst';

export default function MenuManagement() {
  const { categories, items, toggleAvailability, updateItem, addItem } = useMenuStore();
  const toast = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);

  const openAddModal = () => {
    setEditingItem({
      name: '',
      categoryId: categories[0]?.id || '',
      basePrice: 0,
      isVeg: true,
      variants: [],
      addons: [],
      available: true,
      gstRate: 5
    });
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem({ ...item });
  };

  const handleSaveItem = () => {
    if (!editingItem || !editingItem.name || editingItem.basePrice === undefined || !editingItem.categoryId) {
      toast.error('Missing fields', 'Please fill in all required fields');
      return;
    }
    
    if (editingItem.id) {
      updateItem(editingItem.id, editingItem);
      toast.success('Item Updated', `${editingItem.name} has been updated`);
    } else {
      addItem({
        categoryId: editingItem.categoryId,
        name: editingItem.name,
        basePrice: Number(editingItem.basePrice),
        isVeg: editingItem.isVeg ?? true,
        available: true,
        stockQuantity: editingItem.stockQuantity,
        gstRate: editingItem.gstRate || 5,

        variants: editingItem.variants || [],
        addons: editingItem.addons || [],
      });
      toast.success('Item Added', `${editingItem.name} has been added to the menu`);
    }
    
    setEditingItem(null);
  };

  const filteredItems = items.filter((i) => {
    const matchCat = !selectedCategory || i.categoryId === selectedCategory;
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleToggle = (item: MenuItem) => {
    toggleAvailability(item.id);
    toast.success(item.available ? 'Item disabled' : 'Item enabled', `${item.name} is now ${item.available ? 'unavailable' : 'available'}`);
  };

  return (
    <>
      <TopBar title="Menu Management" actions={
        <button className="btn btn-primary btn-sm" onClick={openAddModal}>
          <Plus size={16} /> Add Item
        </button>
      } />
      <div className="page-body">
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 'var(--space-5)', alignItems: 'start' }}>
          {/* Categories sidebar */}
          <div className="card">
            <div className="card-header"><div className="card-title">Categories</div></div>
            <div style={{ padding: 'var(--space-3)' }}>
              <button
                onClick={() => setSelectedCategory(null)}
                className={`nav-item w-full ${!selectedCategory ? 'active' : ''}`}
                style={{ marginBottom: 2 }}
              >
                <ForkKnife size={16} />
                <span>All Items</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{items.length}</span>
              </button>
              {categories.filter((c) => c.active).sort((a,b) => a.sortOrder - b.sortOrder).map((cat) => {
                const count = items.filter((i) => i.categoryId === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`nav-item w-full ${selectedCategory === cat.id ? 'active' : ''}`}
                    style={{ marginBottom: 2 }}
                  >
                    <span className="nav-item-icon"><ForkKnife size={16} /></span>
                    <span>{cat.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Items list */}
          <div>
            <div className="input-with-icon" style={{ marginBottom: 'var(--space-4)' }}>
              <MagnifyingGlass size={18} className="input-icon" />
              <input
                className="input"
                type="search"
                placeholder="Search items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="card">
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Item Name</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>GST</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => {
                      const cat = categories.find((c) => c.id === item.categoryId);
                      const price = item.variants[0]?.price || item.basePrice;
                      return (
                        <tr key={item.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {cat?.type !== 'other' && (
                              <div className={`veg-dot ${item.isVeg ? 'veg' : 'nonveg'}`} />
                            )}
                              <div>
                                <div style={{ fontWeight: 600 }}>{item.name}</div>
                                {item.isSpecial && <span className="badge badge-accent" style={{ fontSize: '0.6rem' }}>Special</span>}
                                {item.isBakery && <span className="badge badge-muted" style={{ fontSize: '0.6rem', marginLeft: 4 }}>Bakery</span>}
                              </div>
                            </div>
                          </td>
                          <td><span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{cat?.name}</span></td>
                          <td>
                            {item.pricePerKg
                              ? <span style={{ fontWeight: 700 }}>₹{item.pricePerKg}/kg</span>
                              : <span style={{ fontWeight: 700 }}>{formatAmount(price)}</span>
                            }
                            {item.variants.length > 1 && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.variants.length} variants</div>
                            )}
                          </td>
                          <td><span className="badge badge-muted">{item.gstRate}%</span></td>
                          <td>
                            <span className={`badge badge-${cat?.type === 'other' ? 'muted' : item.isVeg ? 'free' : 'occupied'}`}>
                              {cat?.type === 'other' ? 'Other' : item.isVeg ? 'Veg' : 'Non-Veg'}
                            </span>
                          </td>
                          <td>
                            <span className={`badge badge-${item.available ? 'free' : 'muted'}`}>
                              {item.available ? 'Available' : '86\'d'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={() => openEditModal(item)}>
                                <PencilSimple size={16} />
                              </button>
                              <button
                                className="btn btn-ghost btn-icon btn-sm"
                                onClick={() => handleToggle(item)}
                                title={item.available ? 'Disable item' : 'Enable item'}
                              >
                                {item.available
                                  ? <ToggleRight size={20} color="var(--status-free)" />
                                  : <ToggleLeft size={20} color="var(--text-muted)" />
                                }
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredItems.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-icon"><ForkKnife size={28} /></div>
                  <div className="empty-state-title">No items found</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {editingItem && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
          <div className="card" style={{ width: 480, maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="card-header">
              <div className="card-title">{editingItem.id ? 'Edit Menu Item' : 'Add New Menu Item'}</div>
            </div>
            <div style={{ padding: 'var(--space-4)', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Item Name *</label>
                <input 
                  className="input" 
                  value={editingItem.name || ''} 
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  placeholder="e.g. Garlic Naan"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Category *</label>
                <select 
                  className="input" 
                  value={editingItem.categoryId || ''} 
                  onChange={(e) => setEditingItem({ ...editingItem, categoryId: e.target.value })}
                >
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Base Price (₹) *</label>
                  <input 
                    type="number"
                    className="input" 
                    value={editingItem.basePrice || ''} 
                    onChange={(e) => setEditingItem({ ...editingItem, basePrice: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g. 150"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Type</label>
                  {categories.find(c => c.id === editingItem.categoryId)?.type === 'other' ? (
                    <input className="input" value="Other" disabled style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }} />
                  ) : (
                    <select 
                      className="input" 
                      value={editingItem.isVeg ? 'veg' : 'nonveg'} 
                      onChange={(e) => setEditingItem({ ...editingItem, isVeg: e.target.value === 'veg' })}
                    >
                      <option value="veg">Veg</option>
                      <option value="nonveg">Non-Veg</option>
                    </select>
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Stock Quantity (Optional)</label>
                  <input 
                    type="number"
                    className="input" 
                    value={editingItem.stockQuantity ?? ''} 
                    onChange={(e) => setEditingItem({ ...editingItem, stockQuantity: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="e.g. 50"
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Leave empty for unlimited</span>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>GST Rate (%)</label>
                  <input 
                    type="number"
                    className="input" 
                    value={editingItem.gstRate || 0} 
                    onChange={(e) => setEditingItem({ ...editingItem, gstRate: (parseFloat(e.target.value) || 0) as 0 | 5 | 12 | 18 | 28 })}
                  />
                </div>
              </div>
              
              <div>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: 4, fontWeight: 600 }}>
                  Variants (Optional)
                  <button 
                    className="btn btn-ghost btn-sm" 
                    style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                    onClick={() => setEditingItem({ ...editingItem, variants: [...(editingItem.variants || []), { id: crypto.randomUUID(), name: '', price: 0 }] })}
                  >
                    + Add Variant
                  </button>
                </label>
                {editingItem.variants && editingItem.variants.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {editingItem.variants.map((v, idx) => (
                      <div key={v.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input className="input" placeholder="Name (e.g. Half)" value={v.name} onChange={(e) => {
                          const newVariants = [...(editingItem.variants || [])];
                          newVariants[idx].name = e.target.value;
                          setEditingItem({ ...editingItem, variants: newVariants });
                        }} />
                        <input type="number" className="input" placeholder="Price" value={v.price || ''} onChange={(e) => {
                          const newVariants = [...(editingItem.variants || [])];
                          newVariants[idx].price = parseFloat(e.target.value) || 0;
                          setEditingItem({ ...editingItem, variants: newVariants });
                        }} style={{ width: 100 }} />
                        <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--status-occupied)' }} onClick={() => {
                          const newVariants = [...(editingItem.variants || [])];
                          newVariants.splice(idx, 1);
                          setEditingItem({ ...editingItem, variants: newVariants });
                        }}>×</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No variants. Base price will be used.</div>
                )}
              </div>
            </div>
            <div style={{ padding: 'var(--space-4)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setEditingItem(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveItem}>Save Item</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
