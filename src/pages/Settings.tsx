import React, { useState, useEffect } from 'react';
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
  const [bridgeStatus, setBridgeStatus] = useState<'unknown'|'online'|'offline'>('unknown');
  const [bridgeChecking, setBridgeChecking] = useState(false);
  const [bridgePrinting, setBridgePrinting] = useState(false);

  const checkBridge = async () => {
    setBridgeChecking(true);
    try {
      let url = 'http://localhost:7878';
      if (form.bridgeServerIp?.trim()) {
        const ip = form.bridgeServerIp.trim();
        url = (ip.startsWith('http://') || ip.startsWith('https://'))
          ? (ip.endsWith('/') ? ip.slice(0, -1) : ip)
          : `http://${ip}:${form.bridgeServerPort || 7878}`;
      }
      
      const r = await fetch(`${url}/ping`, { 
        signal: AbortSignal.timeout(3000),
        headers: { 'Bypass-Tunnel-Reminder': 'true' }
      });
      setBridgeStatus(r.ok ? 'online' : 'offline');
    } catch {
      setBridgeStatus('offline');
    } finally {
      setBridgeChecking(false);
    }
  };



  useEffect(() => {
    if (activeTab === 'printing') {
      checkBridge();
    }
  }, [activeTab]);

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
                  const bridgeIp   = form.bridgeServerIp?.trim();
                  const bridgePort = form.bridgeServerPort || 7878;
                  let url = `http://localhost:${bridgePort}`;
                  if (bridgeIp) {
                    url = (bridgeIp.startsWith('http://') || bridgeIp.startsWith('https://'))
                      ? (bridgeIp.endsWith('/') ? bridgeIp.slice(0, -1) : bridgeIp)
                      : `http://${bridgeIp}:${bridgePort}`;
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
                    const resp = await fetch(`${url}/print`, {
                      method: 'POST', 
                      headers: { 
                        'Content-Type': 'application/json',
                        'Bypass-Tunnel-Reminder': 'true'
                      },
                      body: JSON.stringify({ ip: p.ip, port: p.port, data: b64, encoding: 'base64' }),
                    });
                    const json = await resp.json();
                    if (resp.ok) toast.success('Test print sent!', `${p.name} should print now`);
                    else         toast.error('Print failed', json.error);
                  } catch (e: any) {
                    toast.error('Bridge error', e.message);
                  }
                };

                return (
                  <>
                    {/* Bridge Server */}
                    <div style={{ padding: '16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, fontSize: '0.9375rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                        🖧 Print Bridge Server (runs on laptop)
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14 }}>
                        The bridge server converts print jobs from your Android tablets & phones to real printer commands.
                        Run <code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4 }}>node server.js</code> in the <code>print-server/</code> folder on the laptop.
                        The terminal will show the laptop's LAN IP — enter it below.
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12, marginBottom: 10 }}>
                        <div className="input-group" style={{ margin: 0 }}>
                          <label className="input-label">Bridge Server IP or HTTPS URL</label>
                          <input className="input" placeholder="192.168.1.50 or https://..." value={form.bridgeServerIp || ''} onChange={e => setForm({ ...form, bridgeServerIp: e.target.value })} />
                        </div>
                        <div className="input-group" style={{ margin: 0 }}>
                          <label className="input-label">Port</label>
                          <input className="input" type="number" value={form.bridgeServerPort || 7878} onChange={e => setForm({ ...form, bridgeServerPort: parseInt(e.target.value) || 7878 })} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button className="btn btn-ghost btn-sm" type="button" disabled={bridgeChecking} onClick={checkBridge}>
                          {bridgeChecking ? '⏳ Checking…' : '🔄 Check Connection'}
                        </button>
                        <div style={{
                          fontSize: '0.82rem', fontWeight: 600,
                          color: bridgeStatus === 'online' ? '#16a34a' : bridgeStatus === 'offline' ? '#dc2626' : 'var(--text-muted)',
                        }}>
                          {bridgeStatus === 'online'  && '✅ Bridge Online — all devices can print'}
                          {bridgeStatus === 'offline' && '❌ Bridge offline — start the print server on the laptop'}
                          {bridgeStatus === 'unknown' && '⬜ Not checked yet'}
                        </div>
                      </div>
                    </div>

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
                        <button className="btn btn-primary btn-sm" type="button" onClick={addPrinter}>+ Add Printer</button>
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
                              <button className="btn btn-ghost btn-sm" type="button" disabled={!p.ip || bridgeStatus !== 'online'} onClick={() => testPrint(p)}>
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

