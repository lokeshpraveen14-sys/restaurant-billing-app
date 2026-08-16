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
                  {/* Connection Type */}
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 12, fontSize: '0.9375rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Printer size={18} color="var(--accent)" />
                      Printer Connection Type
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                      {([
                        { id: 'browser', label: 'Browser / OS', icon: '🖥️', desc: 'Use system print dialog' },
                        { id: 'lan',     label: 'LAN (Ethernet)', icon: '🔌', desc: 'Wired network printer' },
                        { id: 'wifi',    label: 'Wi-Fi',          icon: '📶', desc: 'Wireless network printer' },
                        { id: 'usb',     label: 'USB',            icon: '🔷', desc: 'Direct USB connection' },
                        { id: 'bluetooth', label: 'Bluetooth',    icon: '📡', desc: 'Bluetooth thermal printer' },
                      ] as const).map(pt => (
                        <button
                          key={pt.id}
                          type="button"
                          onClick={() => setForm({ ...form, printerType: pt.id })}
                          style={{
                            padding: '14px 10px',
                            borderRadius: 'var(--radius-md)',
                            border: `2px solid ${form.printerType === pt.id ? 'var(--accent)' : 'var(--border)'}`,
                            background: form.printerType === pt.id ? 'var(--accent-soft, color-mix(in srgb, var(--accent) 12%, transparent))' : 'var(--bg-elevated)',
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'all 0.15s',
                          }}
                        >
                          <div style={{ fontSize: '1.6rem', marginBottom: 6 }}>{pt.icon}</div>
                          <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: form.printerType === pt.id ? 'var(--accent)' : 'var(--text)' }}>{pt.label}</div>
                          <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: 3 }}>{pt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* LAN / Wi-Fi IP & Port */}
                  {(form.printerType === 'lan' || form.printerType === 'wifi') && (
                    <div style={{ padding: '16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 700, marginBottom: 12, fontSize: '0.875rem' }}>
                        {form.printerType === 'lan' ? '🔌 LAN Printer Settings' : '📶 Wi-Fi Printer Settings'}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12 }}>
                        <div className="input-group" style={{ margin: 0 }}>
                          <label className="input-label">Printer IP Address</label>
                          <input
                            className="input"
                            placeholder="e.g. 192.168.1.100"
                            value={form.printerIp}
                            onChange={(e) => setForm({ ...form, printerIp: e.target.value })}
                          />
                        </div>
                        <div className="input-group" style={{ margin: 0 }}>
                          <label className="input-label">Port</label>
                          <input
                            className="input"
                            type="number"
                            placeholder="9100"
                            value={form.printerPort}
                            onChange={(e) => setForm({ ...form, printerPort: parseInt(e.target.value) || 9100 })}
                          />
                        </div>
                      </div>
                      <div style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        ℹ️ Default port for ESC/POS thermal printers is <strong>9100</strong>. Make sure the printer and this device are on the same Wi-Fi network.
                      </div>
                    </div>
                  )}

                  {/* USB */}
                  {form.printerType === 'usb' && (
                    <div style={{ padding: '16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: '0.875rem' }}>🔷 USB Printer</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                        USB printing works via the <strong>browser's system print dialog</strong>. Connect your USB printer to the same device running this app and the OS will detect it automatically. Choose the correct printer name in the print dialog.
                      </div>
                    </div>
                  )}

                  {/* Bluetooth */}
                  {form.printerType === 'bluetooth' && (
                    <div style={{ padding: '16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 700, marginBottom: 12, fontSize: '0.875rem' }}>📡 Bluetooth Printer Settings</div>
                      <div className="input-group" style={{ margin: 0 }}>
                        <label className="input-label">Bluetooth Device Name (for your reference)</label>
                        <input
                          className="input"
                          placeholder="e.g. POS-80 or Xprinter BT"
                          value={form.printerBluetoothName}
                          onChange={(e) => setForm({ ...form, printerBluetoothName: e.target.value })}
                        />
                      </div>
                      <div style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                        ℹ️ Pair the Bluetooth printer with your device via OS Bluetooth settings first. Then printing will route through the browser's print dialog to the paired BT printer.
                      </div>
                    </div>
                  )}

                  {/* Paper Width */}
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 12, fontSize: '0.9375rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                      🧻 Paper Roll Width
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      {([
                        { val: '58mm', label: '58 mm',  desc: 'Narrow – portable printers' },
                        { val: '80mm', label: '80 mm',  desc: 'Standard – most POS printers' },
                        { val: 'A4',   label: 'A4 Page',desc: 'Laser / Inkjet / PDF' },
                      ] as const).map(pw => (
                        <button
                          key={pw.val}
                          type="button"
                          onClick={() => setForm({ ...form, printerWidth: pw.val })}
                          style={{
                            padding: '12px 10px',
                            borderRadius: 'var(--radius-md)',
                            border: `2px solid ${form.printerWidth === pw.val ? 'var(--accent)' : 'var(--border)'}`,
                            background: form.printerWidth === pw.val ? 'var(--accent-soft, color-mix(in srgb, var(--accent) 12%, transparent))' : 'var(--bg-elevated)',
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'all 0.15s',
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: form.printerWidth === pw.val ? 'var(--accent)' : 'var(--text)' }}>{pw.label}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3 }}>{pw.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Auto-Print toggles */}
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 12, fontSize: '0.9375rem' }}>⚡ Auto-Print</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[
                        { key: 'autoPrintBill' as const, label: 'Auto-print Bill', desc: 'Open print dialog automatically when a bill is finalized' },
                        { key: 'autoPrintKot'  as const, label: 'Auto-print KOT',  desc: 'Open print dialog automatically when a KOT is sent to kitchen' },
                      ].map(toggle => (
                        <label
                          key={toggle.key}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 14,
                            padding: '12px 14px', background: 'var(--bg-elevated)',
                            borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!!form[toggle.key]}
                            onChange={(e) => setForm({ ...form, [toggle.key]: e.target.checked })}
                            style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }}
                          />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{toggle.label}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{toggle.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Test Print */}
                  <div style={{ padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>🖨️ Test Print</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                      Print a sample receipt to verify your printer is connected and configured correctly.
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      onClick={() => {
                        const w = window.open('', '_blank', 'width=400,height=500');
                        if (!w) return;
                        const width = form.printerWidth === '58mm' ? '58mm' : form.printerWidth === '80mm' ? '80mm' : '210mm';
                        w.document.write(`
                          <html><head><title>Test Print</title>
                          <style>
                            body { font-family: monospace; font-size: 12px; width: ${width}; margin: 0 auto; padding: 8px; }
                            h2 { text-align: center; font-size: 14px; margin: 4px 0; }
                            p  { text-align: center; margin: 2px 0; }
                            hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
                          </style></head>
                          <body>
                            <h2>${form.restaurantName || 'Restaurant'}</h2>
                            <p>${form.outlet || ''}</p>
                            <hr/>
                            <p>** TEST PRINT **</p>
                            <p>Printer: ${(form.printerType || 'browser').toUpperCase()}</p>
                            ${(form.printerType === 'lan' || form.printerType === 'wifi') ? `<p>IP: ${form.printerIp || '-'} : ${form.printerPort || 9100}</p>` : ''}
                            <p>Paper: ${form.printerWidth}</p>
                            <hr/>
                            <p>If you can read this, your</p>
                            <p>printer is working correctly!</p>
                            <hr/>
                            <p>${new Date().toLocaleString()}</p>
                          </body></html>
                        `);
                        w.document.close();
                        w.print();
                      }}
                    >
                      <Printer size={15} /> Print Test Page
                    </button>
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
