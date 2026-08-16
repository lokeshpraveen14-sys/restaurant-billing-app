import React, { useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { useMenuStore } from '../store/menuStore';
import { useToast } from '../store/uiStore';
import { Gear, Printer, CreditCard, Building, Percent } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';

const GST_RATES = [0, 5, 12, 18, 28] as const;

export default function Settings() {
  const { settings, updateSettings } = useSettingsStore();
  const { categories } = useMenuStore();
  const toast = useToast();
  const [form, setForm] = useState({ ...settings });
  const [activeTab, setActiveTab] = useState('restaurant');

  const handleSave = () => {
    updateSettings(form);
    toast.success('Settings saved', 'All changes have been applied');
  };

  const tabs = [
    { id: 'restaurant', label: 'Restaurant', icon: <Building size={16} /> },
    { id: 'billing', label: 'Billing & Tax', icon: <CreditCard size={16} /> },
    { id: 'gst', label: 'GST Config', icon: <Percent size={16} /> },
    { id: 'printing', label: 'Printing', icon: <Printer size={16} /> },
  ];

  const updateCategoryGst = (catId: string, rate: number) => {
    setForm({
      ...form,
      categoryGstRates: { ...form.categoryGstRates, [catId]: rate },
    });
  };

  return (
    <>
      <TopBar title="Settings" />
      <div className="page-body">
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 'var(--space-5)', maxWidth: 900 }}>
          {/* Tab Nav */}
          <div className="card" style={{ padding: 'var(--space-3)', height: 'fit-content' }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`nav-item w-full ${activeTab === tab.id ? 'active' : ''}`}
                style={{ marginBottom: 4 }}
              >
                <span className="nav-item-icon">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                {tabs.find((t) => t.id === activeTab)?.label} Settings
              </div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {activeTab === 'restaurant' && (
                <>
                  <div className="input-group">
                    <label className="input-label">Restaurant Name</label>
                    <input className="input" value={form.restaurantName} onChange={(e) => setForm({ ...form, restaurantName: e.target.value })} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Address</label>
                    <textarea className="input" rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={{ resize: 'vertical' }} />
                  </div>
                  <div className="grid grid-2" style={{ gap: 16 }}>
                    <div className="input-group">
                      <label className="input-label">Phone</label>
                      <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                    </div>
                    <div className="input-group">
                      <label className="input-label">Email</label>
                      <input className="input" type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                  </div>
                  <div className="input-group">
                    <label className="input-label">GSTIN</label>
                    <input className="input" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Outlet / Branch Name</label>
                    <input className="input" value={form.outlet} onChange={(e) => setForm({ ...form, outlet: e.target.value })} />
                  </div>
                </>
              )}

              {activeTab === 'billing' && (
                <>
                  <div className="grid grid-2" style={{ gap: 16 }}>
                    <div className="input-group">
                      <label className="input-label">Invoice Prefix</label>
                      <input className="input" value={form.invoicePrefix} onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })} />
                    </div>
                    <div className="input-group">
                      <label className="input-label">Financial Year</label>
                      <input className="input" value={form.financialYear} onChange={(e) => setForm({ ...form, financialYear: e.target.value })} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>Service Charge</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Apply service charge to bills</div>
                    </div>
                    <label className="switch">
                      <input type="checkbox" checked={form.serviceChargeEnabled} onChange={(e) => setForm({ ...form, serviceChargeEnabled: e.target.checked })} />
                      <span className="switch-slider" />
                    </label>
                  </div>

                  {form.serviceChargeEnabled && (
                    <div className="input-group">
                      <label className="input-label">Service Charge Percentage</label>
                      <input className="input" type="number" min={0} max={20} value={form.serviceChargePercent} onChange={(e) => setForm({ ...form, serviceChargePercent: parseFloat(e.target.value) || 0 })} />
                    </div>
                  )}

                  <div className="input-group">
                    <label className="input-label">UPI ID (for QR payments)</label>
                    <input className="input" value={form.upiId || ''} onChange={(e) => setForm({ ...form, upiId: e.target.value })} placeholder="yourrestaurant@upi" />
                  </div>
                </>
              )}

              {activeTab === 'gst' && (
                <>
                  {/* Global GST toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '2px solid var(--accent)', boxShadow: '0 0 0 4px var(--accent-dim)' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem' }}>GST Enabled</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        {form.gstEnabled ? 'GST is being applied to all bills' : 'GST is disabled globally — no tax on any bill'}
                      </div>
                    </div>
                    <label className="switch">
                      <input type="checkbox" checked={form.gstEnabled} onChange={(e) => setForm({ ...form, gstEnabled: e.target.checked })} />
                      <span className="switch-slider" />
                    </label>
                  </div>

                  {form.gstEnabled && (
                    <>
                      {/* Default GST rate */}
                      <div className="input-group">
                        <label className="input-label">Default GST Rate (for new items)</label>
                        <select
                          className="input select"
                          value={form.defaultGstRate}
                          onChange={(e) => setForm({ ...form, defaultGstRate: parseInt(e.target.value) as any })}
                        >
                          {GST_RATES.map(r => (
                            <option key={r} value={r}>{r}%</option>
                          ))}
                        </select>
                      </div>

                      {/* Per-category GST overrides */}
                      <div>
                        <div style={{ fontWeight: 700, marginBottom: 12, fontSize: '0.9375rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Percent size={18} color="var(--accent)" />
                          GST Rate per Category
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {categories.filter(c => c.active).map(cat => {
                            const currentRate = form.categoryGstRates[cat.id] ?? form.defaultGstRate;
                            const typeColors: Record<string, string> = {
                              food: 'var(--status-free)',
                              juice: '#06b6d4',
                              bakery: 'var(--status-reserved)',
                              beverage: '#8b5cf6',
                              dessert: '#ec4899',
                            };
                            return (
                              <div
                                key={cat.id}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 12,
                                  padding: '10px 14px', background: 'var(--bg-elevated)',
                                  borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                                }}
                              >
                                <div style={{
                                  width: 8, height: 8, borderRadius: '50%',
                                  background: typeColors[cat.type] || 'var(--text-muted)', flexShrink: 0,
                                }} />
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{cat.name}</div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{cat.type}</div>
                                </div>
                                <select
                                  className="input select"
                                  style={{ width: 100, padding: '6px 8px', fontSize: '0.875rem' }}
                                  value={currentRate}
                                  onChange={(e) => updateCategoryGst(cat.id, parseInt(e.target.value))}
                                >
                                  {GST_RATES.map(r => (
                                    <option key={r} value={r}>{r}%</option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ marginTop: 8, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                          ℹ️ Category GST overrides the per-item GST rate when billing
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {activeTab === 'printing' && (
                <>
                  <div className="input-group">
                    <label className="input-label">Printer Width</label>
                    <select className="input select" value={form.printerWidth} onChange={(e) => setForm({ ...form, printerWidth: e.target.value as '58mm' | '80mm' | 'A4' })}>
                      <option value="58mm">58mm (Narrow)</option>
                      <option value="80mm">80mm (Standard)</option>
                      <option value="A4">A4 (Full Page)</option>
                    </select>
                  </div>
                  <div style={{ padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Bill Preview Width</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      {form.printerWidth === '58mm' && 'Narrow thermal roll — ideal for portable printers'}
                      {form.printerWidth === '80mm' && 'Standard 3-inch thermal — most common for POS'}
                      {form.printerWidth === 'A4' && 'Full A4 page — for laser/inkjet printers, PDF generation'}
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setForm({ ...settings })}>Reset</button>
                <button className="btn btn-primary" onClick={handleSave}>
                  <Gear size={16} /> Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
