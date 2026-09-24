import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { useMenuStore } from '../store/menuStore';
import { useToast } from '../store/uiStore';
import { Gear, Printer, CreditCard, Building, Percent, ArrowsClockwise, Warning, ShieldCheck } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { supabase } from '../lib/supabase';
import { useAuthStore, ALL_MODULES, DEFAULT_ROLE_PERMISSIONS, PermissionModule } from '../store/authStore';
import { UserRole } from '../types';

const GST_RATES = [0, 5, 12, 18, 28] as const;

export default function Settings() {
  const { settings, updateSettings, syncPrintersToCloud, syncRestaurantSettingsToCloud } = useSettingsStore();
  const { categories } = useMenuStore();
  const toast = useToast();
  const [form, setForm] = useState({ ...settings });
  const [activeTab, setActiveTab] = useState('restaurant');
  const [bridgePrinting, setBridgePrinting] = useState(false);
  const { rolePermissions, updateRolePermissions } = useAuthStore();
  const [selectedRole, setSelectedRole] = useState<UserRole>('manager');

  const handleSave = () => {
    updateSettings(form);
    // Sync printer config to cloud so all devices get the same printers
    syncPrintersToCloud();
    // Sync restaurant info (name, address, GSTIN, etc.) to cloud
    syncRestaurantSettingsToCloud();
    toast.success('Settings saved', 'All changes have been applied');
  };

  const handleHardRefresh = () => {
    if (window.confirm('This will clear local cache and reload the application to ensure you have the latest version. Proceed?')) {
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach(name => {
            caches.delete(name);
          });
        });
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          for (let registration of registrations) {
            registration.unregister();
          }
        });
      }
      window.location.reload();
    }
  };

  const tabs = [
    { id: 'restaurant', label: 'Restaurant', icon: <Building size={16} /> },
    { id: 'billing', label: 'Billing & Tax', icon: <CreditCard size={16} /> },
    { id: 'gst', label: 'GST Config', icon: <Percent size={16} /> },
    { id: 'printing', label: 'Printing', icon: <Printer size={16} /> },
    { id: 'permissions', label: 'Role Permissions', icon: <ShieldCheck size={16} /> },
    { id: 'system', label: 'System', icon: <Gear size={16} /> },
  ];

  const NON_ADMIN_ROLES: { id: UserRole; label: string; color: string }[] = [
    { id: 'manager', label: 'Manager', color: '#7c3aed' },
    { id: 'cashier', label: 'Cashier', color: '#0ea5e9' },
    { id: 'waiter', label: 'Waiter', color: '#10b981' },
    { id: 'kitchen', label: 'Kitchen', color: '#f59e0b' },
  ];

  const togglePermission = (role: UserRole, module: PermissionModule) => {
    const current = rolePermissions[role] ?? DEFAULT_ROLE_PERMISSIONS[role] ?? [];
    const next = current.includes(module)
      ? current.filter(m => m !== module)
      : [...current, module];
    updateRolePermissions(role, next);
    toast.success('Permission updated', `${role} role updated successfully`);
  };

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

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginTop: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>Parcel / Packaging Charge</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Apply flat extra charge for takeaway orders</div>
                    </div>
                    <label className="switch">
                      <input type="checkbox" checked={form.parcelChargeEnabled} onChange={(e) => setForm({ ...form, parcelChargeEnabled: e.target.checked })} />
                      <span className="switch-slider" />
                    </label>
                  </div>

                  {form.parcelChargeEnabled && (
                    <div className="input-group" style={{ marginTop: 12 }}>
                      <label className="input-label">Parcel Charge Amount (₹)</label>
                      <input className="input" type="number" min={0} value={form.parcelCharge || 0} onChange={(e) => setForm({ ...form, parcelCharge: parseFloat(e.target.value) || 0 })} />
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

              {activeTab === 'printing' && (() => {
                const printers = form.printers || [];
                const ROLES = [
                  { id: 'billing',  label: 'Cashier / Bill',   icon: '🧾' },
                  { id: 'kot',      label: 'Kitchen KOT',       icon: '🍳' },
                  { id: 'bakery',   label: 'Bakery Counter',    icon: '🥐' },
                  { id: 'juice',    label: 'Juice Counter',     icon: '🥤' },
                  { id: 'shawarma', label: 'Shawarma Counter',  icon: '🌯' },
                  { id: 'custom',   label: 'Custom / Other',    icon: '🖨️' },
                ] as const;

                const addPrinter = () => {
                  const newP = { id: crypto.randomUUID(), name: 'New Printer', role: 'billing' as const, ip: '', port: 9100, width: '80mm' as const, enabled: true };
                  setForm({ ...form, printers: [...printers, newP] });
                };

                const updatePrinter = (id: string, patch: object) => {
                  setForm({ ...form, printers: printers.map(p => p.id === id ? { ...p, ...patch } : p) });
                };

                const removePrinter = (id: string) => {
                  setForm({ ...form, printers: printers.filter(p => p.id !== id) });
                };

                const testPrint = async (p: typeof printers[number]) => {
                  if (!p.ip) {
                    toast.error('Missing IP', 'Please enter a valid IP address for this printer.');
                    return;
                  }
                  
                  const ESC = '\x1b', GS = '\x1d';
                  const raw =
                    ESC + '@' + ESC + 'a\x01' + ESC + 'E\x01' +
                    (form.restaurantName || 'Restaurant') + '\n' +
                    ESC + 'E\x00' +
                    '------------------------------\n' +
                    '   ** TEST PRINT **\n' +
                    'Counter : ' + (ROLES.find(r => r.id === p.role)?.label || p.role) + '\n' +
                    'Printer : ' + p.name + '\n' +
                    'IP      : ' + p.ip + ':' + p.port + '\n' +
                    'Paper   : ' + p.width + '\n' +
                    '------------------------------\n' +
                    'Printer is working correctly!\n' +
                    new Date().toLocaleString() + '\n' +
                    '\n\n\n\n' + GS + 'V\x00';

                  const b64 = btoa(unescape(encodeURIComponent(raw)));
                  try {
                    const { error } = await supabase.from('print_jobs').insert({
                      printer_ip: p.ip,
                      printer_port: p.port || 9100,
                      receipt_data: b64,
                      status: 'pending'
                    });
                    
                    if (error) throw error;
                    toast.success('Cloud Print Sent!', `${p.name} will print in a few seconds.`);
                  } catch (e: any) {
                    toast.error('Cloud Print Error', e.message);
                  }
                };

                return (
                  <>

                    {/* Default paper width */}
                    <div className="input-group" style={{ margin: 0 }}>
                      <label className="input-label">Default Paper Width (used for browser fallback)</label>
                      <select className="input select" value={form.printerWidth} onChange={e => setForm({ ...form, printerWidth: e.target.value as '58mm' | '80mm' | 'A4' })}>
                        <option value="58mm">58 mm – Narrow portable</option>
                        <option value="80mm">80 mm – Standard thermal</option>
                        <option value="A4">A4 – Laser / PDF</option>
                      </select>
                    </div>

                    {/* Auto-print */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {([{ key: 'autoPrintBill', label: 'Auto-print Bill' }, { key: 'autoPrintKot', label: 'Auto-print KOT' }] as const).map(t => (
                        <label key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem' }}>
                          <input type="checkbox" checked={!!form[t.key]} onChange={e => setForm({ ...form, [t.key]: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                          {t.label}
                        </label>
                      ))}
                    </div>

                    {/* Printer Profiles */}
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 12, fontSize: '0.9375rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>🖨️ Printer Profiles</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            type="button"
                            onClick={async () => {
                              await useSettingsStore.getState().fetchPrintersFromCloud();
                              setForm(useSettingsStore.getState().settings);
                              toast.success('Printers Refreshed', 'Pulled latest printer settings from cloud');
                            }}
                          >
                            🔄 Refresh Cloud Printers
                          </button>
                          <button className="btn btn-primary btn-sm" type="button" onClick={addPrinter}>+ Add Printer</button>
                        </div>
                      </div>

                      {printers.length === 0 && (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)' }}>
                          No printers added yet. Click <strong>+ Add Printer</strong> for each counter.
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {printers.map(p => (
                          <div key={p.id} style={{
                            padding: '14px 16px', borderRadius: 'var(--radius-md)',
                            border: `1px solid ${p.enabled ? 'var(--border)' : 'var(--border)'}`,
                            background: p.enabled ? 'var(--bg-elevated)' : 'var(--bg)',
                            opacity: p.enabled ? 1 : 0.6,
                          }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                              <div className="input-group" style={{ margin: 0 }}>
                                <label className="input-label">Printer Name</label>
                                <input className="input" placeholder="e.g. Cashier Printer" value={p.name} onChange={e => updatePrinter(p.id, { name: e.target.value })} />
                              </div>
                              <div className="input-group" style={{ margin: 0 }}>
                                <label className="input-label">Counter / Role</label>
                                <select className="input select" value={p.role} onChange={e => updatePrinter(p.id, { role: e.target.value })}>
                                  {ROLES.map(r => <option key={r.id} value={r.id}>{r.icon} {r.label}</option>)}
                                </select>
                              </div>
                              <div className="input-group" style={{ margin: 0 }}>
                                <label className="input-label">Printer IP Address</label>
                                <input className="input" placeholder="192.168.1.100" value={p.ip} onChange={e => updatePrinter(p.id, { ip: e.target.value })} />
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <div className="input-group" style={{ margin: 0 }}>
                                  <label className="input-label">Port</label>
                                  <input className="input" type="number" value={p.port} onChange={e => updatePrinter(p.id, { port: parseInt(e.target.value) || 9100 })} />
                                </div>
                                <div className="input-group" style={{ margin: 0 }}>
                                  <label className="input-label">Paper</label>
                                  <select className="input select" value={p.width} onChange={e => updatePrinter(p.id, { width: e.target.value })}>
                                    <option value="58mm">58mm</option>
                                    <option value="80mm">80mm</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', cursor: 'pointer' }}>
                                <input type="checkbox" checked={p.enabled} onChange={e => updatePrinter(p.id, { enabled: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
                                Enabled
                              </label>
                              <button className="btn btn-ghost btn-sm" type="button" disabled={!p.ip} onClick={() => testPrint(p)}>
                                🖨️ Test Print
                              </button>
                              <button className="btn btn-ghost btn-sm" type="button" style={{ color: '#ef4444', marginLeft: 'auto' }} onClick={() => removePrinter(p.id)}>
                                🗑️ Remove
                              </button>
                            </div>
                            {!p.ip && <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: 6 }}>⚠️ Enter IP address to enable printing</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()}

              {activeTab === 'permissions' && (() => {
                const roleInfo = NON_ADMIN_ROLES.find(r => r.id === selectedRole)!;
                const currentPerms = rolePermissions[selectedRole] ?? DEFAULT_ROLE_PERMISSIONS[selectedRole] ?? [];
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Header */}
                    <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg, var(--brand-color) 0%, var(--brand-color-dark, #4f46e5) 100%)', borderRadius: 12, color: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <ShieldCheck size={24} />
                        <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>Role-Based Access Control</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Admin always has full access. Configure which pages each role can access.</div>
                    </div>

                    {/* Role selector */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {NON_ADMIN_ROLES.map(r => (
                        <button
                          key={r.id}
                          onClick={() => setSelectedRole(r.id)}
                          style={{
                            padding: '8px 18px',
                            borderRadius: 20,
                            border: `2px solid ${r.color}`,
                            background: selectedRole === r.id ? r.color : 'transparent',
                            color: selectedRole === r.id ? '#fff' : r.color,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            transition: 'all 0.15s',
                          }}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>

                    {/* Permission grid */}
                    <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                      <div style={{ padding: '12px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: roleInfo.color, display: 'inline-block' }} />
                        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{roleInfo.label} Permissions</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {currentPerms.length} of {ALL_MODULES.length} modules enabled
                        </span>
                      </div>
                      {ALL_MODULES.map((mod, idx) => {
                        const enabled = currentPerms.includes(mod.id);
                        return (
                          <div
                            key={mod.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '14px 20px',
                              borderBottom: idx < ALL_MODULES.length - 1 ? '1px solid var(--border)' : 'none',
                              background: enabled ? 'var(--bg-primary)' : 'transparent',
                              transition: 'background 0.15s',
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                {mod.label}
                              </div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                {mod.description}
                              </div>
                            </div>
                            {/* Toggle switch */}
                            <button
                              onClick={() => togglePermission(selectedRole, mod.id)}
                              style={{
                                width: 48,
                                height: 26,
                                borderRadius: 13,
                                border: 'none',
                                background: enabled ? roleInfo.color : 'var(--border)',
                                cursor: 'pointer',
                                position: 'relative',
                                transition: 'background 0.2s',
                                flexShrink: 0,
                                marginLeft: 16,
                              }}
                              title={enabled ? 'Click to revoke access' : 'Click to grant access'}
                            >
                              <span style={{
                                position: 'absolute',
                                top: 3,
                                left: enabled ? 25 : 3,
                                width: 20,
                                height: 20,
                                borderRadius: '50%',
                                background: '#fff',
                                transition: 'left 0.2s',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                              }} />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Quick presets */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginRight: 4 }}>Quick presets:</span>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => { updateRolePermissions(selectedRole, [...ALL_MODULES.map(m => m.id)]); toast.success('All enabled', `${selectedRole} given full access`); }}
                      >
                        Enable All
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => { updateRolePermissions(selectedRole, []); toast.success('All disabled', `${selectedRole} access revoked`); }}
                        style={{ color: 'var(--danger)' }}
                      >
                        Disable All
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => { updateRolePermissions(selectedRole, [...(DEFAULT_ROLE_PERMISSIONS[selectedRole] ?? [])]); toast.success('Reset done', `${selectedRole} permissions restored to default`); }}
                      >
                        Reset to Default
                      </button>
                    </div>

                    <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      <strong>Note:</strong> Changes take effect immediately for all devices. Users currently logged in will see updated permissions on their next page navigation.
                    </div>
                  </div>
                );
              })()}

              {activeTab === 'system' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ background: 'var(--bg-elevated)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--text-primary)', fontWeight: 600 }}>
                      <ArrowsClockwise size={20} />
                      Hard Refresh / Update App
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                      If you are experiencing bugs or the app feels out of sync, clicking this button will clear the browser's application cache and force-download the latest code updates from the server.
                    </div>
                    <button 
                      className="btn btn-secondary" 
                      onClick={handleHardRefresh}
                      style={{ color: 'var(--status-billing)', borderColor: 'var(--status-billing)' }}
                    >
                      <Warning size={16} /> Force Reload & Update
                    </button>
                  </div>
                </div>
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

