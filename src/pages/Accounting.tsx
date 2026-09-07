import React, { useState, useEffect } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { useToast } from '../store/uiStore';
import { Bank, Wallet, Storefront, ChartLineUp, Plus, FileText, Buildings, UserCircle, CurrencyInr } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { formatAmount } from '../lib/gst';
import { LedgerAccountType, LedgerTransactionType } from '../types';

export default function Accounting() {
  const { vendors, bankAccounts, ledgerTransactions, addVendor, updateVendor, addBankAccount, addLedgerTransaction, initAccountingSync } = useAccountingStore();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'bank' | 'vendors' | 'ledger'>('bank');
  
  // Modals
  const [showAddBank, setShowAddBank] = useState(false);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);

  // Forms
  const [bankForm, setBankForm] = useState({ accountName: '', accountNumber: '', bankName: '', openingBalance: 0 });
  const [vendorForm, setVendorForm] = useState({ name: '', contactPerson: '', phone: '', address: '', gstNumber: '', openingBalance: 0 });
  const [txForm, setTxForm] = useState({ 
    accountType: 'bank' as LedgerAccountType, 
    accountId: '', 
    transactionType: 'credit' as LedgerTransactionType, 
    amount: 0, 
    description: '', 
    date: new Date().toISOString().slice(0, 10) 
  });

  useEffect(() => {
    initAccountingSync();
  }, []);

  const handleAddBank = () => {
    if (!bankForm.accountName) return toast.error('Required', 'Account Name is required');
    addBankAccount({ ...bankForm, currentBalance: bankForm.openingBalance });
    toast.success('Added', 'Bank account added successfully');
    setShowAddBank(false);
    setBankForm({ accountName: '', accountNumber: '', bankName: '', openingBalance: 0 });
  };

  const handleAddVendor = () => {
    if (!vendorForm.name) return toast.error('Required', 'Vendor Name is required');
    addVendor(vendorForm);
    toast.success('Added', 'Vendor added successfully');
    setShowAddVendor(false);
    setVendorForm({ name: '', contactPerson: '', phone: '', address: '', gstNumber: '', openingBalance: 0 });
  };

  const handleAddTx = () => {
    if (!txForm.amount) return toast.error('Required', 'Amount is required');
    if (txForm.accountType !== 'cash' && !txForm.accountId) return toast.error('Required', 'Please select an account');
    
    addLedgerTransaction({
      ...txForm,
      accountId: txForm.accountId || undefined,
      date: new Date(txForm.date)
    });
    toast.success('Recorded', 'Transaction recorded successfully');
    setShowAddTx(false);
  };

  // Calculations
  const totalCashAndBank = bankAccounts.reduce((sum, b) => sum + b.currentBalance, 0); // Simplified, not factoring pure cash yet
  const totalPayables = vendors.reduce((sum, v) => {
    // Current payable logic: Opening + purchases(credits to vendor) - payments(debits to vendor)
    const vendorTxs = ledgerTransactions.filter(t => t.accountType === 'vendor' && t.accountId === v.id);
    const credits = vendorTxs.filter(t => t.transactionType === 'credit').reduce((s, t) => s + t.amount, 0);
    const debits = vendorTxs.filter(t => t.transactionType === 'debit').reduce((s, t) => s + t.amount, 0);
    return sum + v.openingBalance + credits - debits;
  }, 0);

  return (
    <>
      <TopBar title="Accounting & Ledgers" actions={
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddTx(true)}>
            <Plus size={16} /> Record Transaction
          </button>
        </div>
      } />
      
      <div className="page-body">
        
        {/* Top Stats */}
        <div className="grid grid-3" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
          <div className="stat-card" style={{ borderLeft: `3px solid var(--status-free)` }}>
            <div className="stat-label">Total Cash & Bank Balance</div>
            <div className="stat-value" style={{ color: 'var(--status-free)' }}>{formatAmount(totalCashAndBank)}</div>
          </div>
          <div className="stat-card" style={{ borderLeft: `3px solid var(--status-billing)` }}>
            <div className="stat-label">Total Vendor Payables</div>
            <div className="stat-value" style={{ color: 'var(--status-billing)' }}>{formatAmount(totalPayables)}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs" style={{ padding: 3, marginBottom: 'var(--space-5)', display: 'inline-flex' }}>
          <button className={`tab-item ${activeTab === 'bank' ? 'active' : ''}`} onClick={() => setActiveTab('bank')} style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Bank size={16} /> Bank Accounts
          </button>
          <button className={`tab-item ${activeTab === 'vendors' ? 'active' : ''}`} onClick={() => setActiveTab('vendors')} style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Buildings size={16} /> Vendors / Wholesalers
          </button>
          <button className={`tab-item ${activeTab === 'ledger' ? 'active' : ''}`} onClick={() => setActiveTab('ledger')} style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={16} /> Ledger Book
          </button>
        </div>

        {/* Bank Accounts Tab */}
        {activeTab === 'bank' && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title">Bank & Cash Accounts</div>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddBank(true)}>
                <Plus size={16} /> Add Account
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Account Name</th>
                    <th>Bank Details</th>
                    <th>Opening Balance</th>
                    <th style={{ textAlign: 'right' }}>Current Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {bankAccounts.map(b => (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{b.accountName}</td>
                      <td>
                        <div style={{ fontSize: '0.8rem' }}>{b.bankName || '-'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{b.accountNumber || '-'}</div>
                      </td>
                      <td>{formatAmount(b.openingBalance)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--status-free)' }}>{formatAmount(b.currentBalance)}</td>
                    </tr>
                  ))}
                  {bankAccounts.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No accounts found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Vendors Tab */}
        {activeTab === 'vendors' && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title">Vendors & Wholesalers</div>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddVendor(true)}>
                <Plus size={16} /> Add Vendor
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Vendor Name</th>
                    <th>Contact Info</th>
                    <th>GST No.</th>
                    <th style={{ textAlign: 'right' }}>Outstanding Payable</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map(v => {
                    const vendorTxs = ledgerTransactions.filter(t => t.accountType === 'vendor' && t.accountId === v.id);
                    const credits = vendorTxs.filter(t => t.transactionType === 'credit').reduce((s, t) => s + t.amount, 0);
                    const debits = vendorTxs.filter(t => t.transactionType === 'debit').reduce((s, t) => s + t.amount, 0);
                    const balance = v.openingBalance + credits - debits;
                    
                    return (
                      <tr key={v.id}>
                        <td style={{ fontWeight: 600 }}>{v.name}</td>
                        <td>
                          <div style={{ fontSize: '0.8rem' }}>{v.contactPerson || '-'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{v.phone || v.email || '-'}</div>
                        </td>
                        <td>{v.gstNumber || '-'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: balance > 0 ? 'var(--status-billing)' : 'var(--text-muted)' }}>
                          {formatAmount(balance)}
                        </td>
                      </tr>
                    );
                  })}
                  {vendors.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No vendors found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Ledger Tab */}
        {activeTab === 'ledger' && (
          <div className="card">
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Account Type</th>
                    <th>Entity / Account</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Debit (Out/Paid)</th>
                    <th style={{ textAlign: 'right' }}>Credit (In/Received)</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerTransactions.map(tx => {
                    let entityName = '-';
                    if (tx.accountType === 'vendor') entityName = vendors.find(v => v.id === tx.accountId)?.name || 'Unknown Vendor';
                    if (tx.accountType === 'bank') entityName = bankAccounts.find(b => b.id === tx.accountId)?.accountName || 'Unknown Bank';
                    // Staff isn't fully linked here yet but could be via staffStore
                    
                    return (
                      <tr key={tx.id}>
                        <td>{new Date(tx.date).toLocaleDateString()}</td>
                        <td style={{ textTransform: 'capitalize' }}>
                          <span className={`badge badge-muted`}>{tx.accountType}</span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{entityName}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{tx.description || '-'}</td>
                        <td style={{ textAlign: 'right', color: tx.transactionType === 'debit' ? 'var(--status-billing)' : '' }}>
                          {tx.transactionType === 'debit' ? formatAmount(tx.amount) : '-'}
                        </td>
                        <td style={{ textAlign: 'right', color: tx.transactionType === 'credit' ? 'var(--status-free)' : '' }}>
                          {tx.transactionType === 'credit' ? formatAmount(tx.amount) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                  {ledgerTransactions.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No ledger entries found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add Bank Modal */}
      {showAddBank && (
        <div className="modal-overlay" onClick={() => setShowAddBank(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title"><Bank size={18} style={{ display: 'inline', marginRight: 8 }} />Add Bank Account</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowAddBank(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Account Name / Nickname</label>
                <input className="input" placeholder="e.g. HDFC Main" value={bankForm.accountName} onChange={e => setBankForm({...bankForm, accountName: e.target.value})} />
              </div>
              <div className="input-group">
                <label className="input-label">Bank Name</label>
                <input className="input" value={bankForm.bankName} onChange={e => setBankForm({...bankForm, bankName: e.target.value})} />
              </div>
              <div className="input-group">
                <label className="input-label">Account Number</label>
                <input className="input" value={bankForm.accountNumber} onChange={e => setBankForm({...bankForm, accountNumber: e.target.value})} />
              </div>
              <div className="input-group">
                <label className="input-label">Opening Balance</label>
                <input className="input" type="number" value={bankForm.openingBalance} onChange={e => setBankForm({...bankForm, openingBalance: Number(e.target.value)})} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddBank(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAddBank}>Save Account</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Vendor Modal */}
      {showAddVendor && (
        <div className="modal-overlay" onClick={() => setShowAddVendor(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title"><Buildings size={18} style={{ display: 'inline', marginRight: 8 }} />Add Vendor</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowAddVendor(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Business Name</label>
                <input className="input" value={vendorForm.name} onChange={e => setVendorForm({...vendorForm, name: e.target.value})} />
              </div>
              <div className="grid grid-2" style={{ gap: 16 }}>
                <div className="input-group">
                  <label className="input-label">Contact Person</label>
                  <input className="input" value={vendorForm.contactPerson} onChange={e => setVendorForm({...vendorForm, contactPerson: e.target.value})} />
                </div>
                <div className="input-group">
                  <label className="input-label">Phone</label>
                  <input className="input" value={vendorForm.phone} onChange={e => setVendorForm({...vendorForm, phone: e.target.value})} />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">GST Number</label>
                <input className="input" value={vendorForm.gstNumber} onChange={e => setVendorForm({...vendorForm, gstNumber: e.target.value})} />
              </div>
              <div className="input-group">
                <label className="input-label">Opening Balance (Owed to them)</label>
                <input className="input" type="number" value={vendorForm.openingBalance} onChange={e => setVendorForm({...vendorForm, openingBalance: Number(e.target.value)})} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddVendor(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAddVendor}>Save Vendor</button>
            </div>
          </div>
        </div>
      )}

      {/* Record Transaction Modal */}
      {showAddTx && (
        <div className="modal-overlay" onClick={() => setShowAddTx(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title"><CurrencyInr size={18} style={{ display: 'inline', marginRight: 8 }} />Record Ledger Entry</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowAddTx(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="grid grid-2" style={{ gap: 16 }}>
                <div className="input-group">
                  <label className="input-label">Account Type</label>
                  <select className="input select" value={txForm.accountType} onChange={e => setTxForm({...txForm, accountType: e.target.value as any, accountId: ''})}>
                    <option value="bank">Bank Account</option>
                    <option value="vendor">Vendor</option>
                    <option value="cash">General Cash</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Type</label>
                  <select className="input select" value={txForm.transactionType} onChange={e => setTxForm({...txForm, transactionType: e.target.value as any})}>
                    <option value="credit">Credit (Money In / Payable Increase)</option>
                    <option value="debit">Debit (Money Out / Payable Decrease)</option>
                  </select>
                </div>
              </div>
              
              {txForm.accountType !== 'cash' && (
                <div className="input-group">
                  <label className="input-label">Select Entity</label>
                  <select className="input select" value={txForm.accountId} onChange={e => setTxForm({...txForm, accountId: e.target.value})}>
                    <option value="">Select...</option>
                    {txForm.accountType === 'bank' && bankAccounts.map(b => <option key={b.id} value={b.id}>{b.accountName}</option>)}
                    {txForm.accountType === 'vendor' && vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-2" style={{ gap: 16 }}>
                <div className="input-group">
                  <label className="input-label">Amount</label>
                  <input className="input" type="number" value={txForm.amount} onChange={e => setTxForm({...txForm, amount: Number(e.target.value)})} />
                </div>
                <div className="input-group">
                  <label className="input-label">Date</label>
                  <input className="input" type="date" value={txForm.date} onChange={e => setTxForm({...txForm, date: e.target.value})} />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Description / Notes</label>
                <input className="input" value={txForm.description} onChange={e => setTxForm({...txForm, description: e.target.value})} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddTx(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAddTx}>Record Entry</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
