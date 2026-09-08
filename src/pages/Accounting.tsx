import React, { useState, useEffect, useMemo } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { useBillStore } from '../store/billStore';
import { useToast } from '../store/uiStore';
import {
  Bank, Wallet, Buildings, FileText, Plus, Trash, PencilSimple,
  CurrencyInr, X, ArrowUp, ArrowDown, BookOpen, Receipt, HandCoins,
  ChartPie, Funnel, CaretDown, CaretUp, CheckCircle, ShoppingCart, Info
} from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { formatAmount } from '../lib/gst';
import { LedgerAccountType, LedgerTransactionType, Vendor, BankAccount, Bill } from '../types';

// ─── SECTION NAV ─────────────────────────────────────────────────────────────
type Section = 'dashboard' | 'bank' | 'vendors' | 'ledger' | 'payables' | 'journal';

// ─── Voucher types (Tally-style) ─────────────────────────────────────────────
const VOUCHER_TYPES = [
  { id: 'sales',   label: 'Sales',   icon: '🧾', help: 'Manual sales revenue entry — normally auto-generated when a bill is created. Use only for corrections.' },
  { id: 'payment', label: 'Payment', icon: '💸', help: 'Cash/Bank going OUT of business (paying vendor, expenses, salary, etc.)' },
  { id: 'receipt', label: 'Receipt', icon: '💰', help: 'Cash/Bank coming IN to business (customer payment, refund received, etc.) — normally auto-generated from billing' },
  { id: 'purchase', label: 'Purchase', icon: '🛒', help: 'Goods/Services purchased on credit from vendor (payable increases)' },
  { id: 'contra', label: 'Contra', icon: '🔄', help: 'Transfer between Cash and Bank accounts' },
  { id: 'journal', label: 'Journal', icon: '📓', help: 'All other entries — adjustments, depreciation, cash variance, etc.' },
];

const EXPENSE_HEADS = [
  'Salaries & Wages', 'Rent', 'Electricity', 'Gas / LPG', 'Water Charges',
  'Raw Material Purchase', 'Packaging Material', 'Repairs & Maintenance',
  'Cleaning Supplies', 'Advertisement', 'Staff Welfare', 'Transportation',
  'Bank Charges', 'Petty Cash Expense', 'Other Expenses'
];

export default function Accounting() {
  const {
    vendors, bankAccounts, ledgerTransactions,
    addVendor, updateVendor, deleteVendor,
    addBankAccount, updateBankAccount, deleteBankAccount,
    addLedgerTransaction, deleteLedgerTransaction,
    initAccountingSync
  } = useAccountingStore();
  const toast = useToast();

  const [section, setSection] = useState<Section>('dashboard');

  // Modals
  const [showAddBank, setShowAddBank] = useState(false);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [showVoucher, setShowVoucher] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: string; id: string; name: string } | null>(null);

  // Date filter
  const [filterFrom, setFilterFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [filterTo, setFilterTo] = useState(new Date().toISOString().slice(0, 10));
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');

  // Forms
  const [bankForm, setBankForm] = useState({ accountName: '', accountNumber: '', bankName: '', openingBalance: 0, accountType: 'current' as 'current' | 'savings' | 'cash' });
  const [vendorForm, setVendorForm] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '', gstNumber: '', openingBalance: 0 });

  // Voucher Form (Tally-style)
  const [voucherForm, setVoucherForm] = useState({
    voucherType: 'payment',
    date: new Date().toISOString().slice(0, 10),
    // For Payment/Receipt: which bank/cash account
    bankAccountId: '',
    // Party (vendor) for Purchase/Payment to vendor
    vendorId: '',
    // Expense head for Payments
    expenseHead: EXPENSE_HEADS[0],
    // Contra: from account to account
    fromAccountId: '',
    toAccountId: '',
    amount: 0,
    narration: '',
    referenceNo: '',
  });

  useEffect(() => { initAccountingSync(); }, []);

  // ─── BILLING REVENUE (auto from bills DB) ───────────────────────────────────
  const { fetchBillsByDateRange } = useBillStore();
  const [revPeriod, setRevPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('month');
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [customTo, setCustomTo] = useState(new Date().toISOString().slice(0, 10));
  const [billingData, setBillingData] = useState<{
    bills: Bill[];
    total: number;
    cash: number;
    card: number;
    upi: number;
    count: number;
  }>({ bills: [], total: 0, cash: 0, card: 0, upi: 0, count: 0 });
  const [loadingBills, setLoadingBills] = useState(false);

  const getDateRange = () => {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    let start = new Date(now);
    if (revPeriod === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (revPeriod === 'week') {
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
    } else if (revPeriod === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    } else {
      start = new Date(customFrom + 'T00:00:00');
      return { start, end: new Date(customTo + 'T23:59:59') };
    }
    return { start, end };
  };

  const loadBillingRevenue = async () => {
    setLoadingBills(true);
    try {
      const { start, end } = getDateRange();
      const bills = await fetchBillsByDateRange(start, end);
      const activeBills = bills.filter(b => b.status !== 'void');
      let cash = 0, card = 0, upi = 0, total = 0;
      activeBills.forEach(b => {
        total += b.totalAmount;
        if (Array.isArray(b.payments)) {
          b.payments.forEach((p: any) => {
            const amt = Number(p.amount || 0);
            const mode = (p.method || p.mode || '').toLowerCase();
            if (mode === 'cash') cash += amt;
            else if (mode === 'card') card += amt;
            else if (mode === 'upi') upi += amt;
            else cash += amt; // fallback
          });
        } else {
          total += b.totalAmount;
          cash += b.totalAmount;
        }
      });
      setBillingData({ bills: activeBills, total, cash, card, upi, count: activeBills.length });
    } catch (e) {
      console.error('Failed to load billing revenue', e);
    } finally {
      setLoadingBills(false);
    }
  };

  useEffect(() => { loadBillingRevenue(); }, [revPeriod]);
  useEffect(() => { if (revPeriod === 'custom') loadBillingRevenue(); }, [customFrom, customTo]);

  // ─── Calculations ────────────────────────────────────────────────────────────
  const totalBankBalance = useMemo(
    () => bankAccounts.reduce((s, b) => s + b.currentBalance, 0),
    [bankAccounts]
  );

  const vendorBalances = useMemo(() => {
    return vendors.map(v => {
      const txs = ledgerTransactions.filter(t => t.accountType === 'vendor' && t.accountId === v.id);
      const purchased = txs.filter(t => t.transactionType === 'credit').reduce((s, t) => s + t.amount, 0);
      const paid = txs.filter(t => t.transactionType === 'debit').reduce((s, t) => s + t.amount, 0);
      const balance = v.openingBalance + purchased - paid;
      return { vendor: v, balance, purchased, paid };
    });
  }, [vendors, ledgerTransactions]);

  const totalPayables = useMemo(() => vendorBalances.reduce((s, v) => s + v.balance, 0), [vendorBalances]);

  // Monthly income & expense from ledger
  const thisMonthTxs = useMemo(() => {
    const now = new Date();
    return ledgerTransactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }, [ledgerTransactions]);

  const monthlyPayments = useMemo(
    () => thisMonthTxs.filter(t => t.transactionType === 'debit' && t.accountType === 'bank').reduce((s, t) => s + t.amount, 0),
    [thisMonthTxs]
  );
  const monthlyReceipts = useMemo(
    () => thisMonthTxs.filter(t => t.transactionType === 'credit' && t.accountType === 'bank').reduce((s, t) => s + t.amount, 0),
    [thisMonthTxs]
  );

  // Filtered ledger
  const filteredLedger = useMemo(() => {
    return ledgerTransactions.filter(t => {
      const tDate = new Date(t.date).toISOString().slice(0, 10);
      const inRange = (!filterFrom || tDate >= filterFrom) && (!filterTo || tDate <= filterTo);
      const typeMatch = filterType === 'all' || t.transactionType === filterType;
      const acMatch = filterAccount === 'all' || t.accountType === filterAccount;
      return inRange && typeMatch && acMatch;
    });
  }, [ledgerTransactions, filterFrom, filterTo, filterType, filterAccount]);

  // ─── Voucher Submission ──────────────────────────────────────────────────────
  const handleSubmitVoucher = async () => {
    const { voucherType, date, bankAccountId, vendorId, expenseHead, fromAccountId, toAccountId, amount, narration, referenceNo } = voucherForm;
    if (!amount || amount <= 0) { toast.error('Required', 'Amount must be greater than 0'); return; }
    if (!date) { toast.error('Required', 'Date is required'); return; }

    try {
      if (voucherType === 'payment') {
        if (!bankAccountId) { toast.error('Required', 'Select Cash/Bank account'); return; }
        // Debit bank (money out)
        await addLedgerTransaction({
          date: new Date(date),
          accountType: 'bank',
          accountId: bankAccountId,
          transactionType: 'debit',
          amount,
          description: vendorId
            ? `Payment to ${vendors.find(v => v.id === vendorId)?.name || 'Vendor'} — ${expenseHead}`
            : `${expenseHead} — ${narration || 'Payment'}`,
          referenceId: referenceNo || undefined,
        });
        // If paying a vendor, reduce their payable
        if (vendorId) {
          await addLedgerTransaction({
            date: new Date(date),
            accountType: 'vendor',
            accountId: vendorId,
            transactionType: 'debit',
            amount,
            description: `Payment received — ${narration || ''}`,
            referenceId: referenceNo || undefined,
          });
        }
      } else if (voucherType === 'receipt') {
        if (!bankAccountId) { toast.error('Required', 'Select Cash/Bank account'); return; }
        await addLedgerTransaction({
          date: new Date(date),
          accountType: 'bank',
          accountId: bankAccountId,
          transactionType: 'credit',
          amount,
          description: `Receipt — ${narration || 'Money received'}`,
          referenceId: referenceNo || undefined,
        });
      } else if (voucherType === 'purchase') {
        if (!vendorId) { toast.error('Required', 'Select a vendor for purchase voucher'); return; }
        // Credit vendor account (payable increases)
        await addLedgerTransaction({
          date: new Date(date),
          accountType: 'vendor',
          accountId: vendorId,
          transactionType: 'credit',
          amount,
          description: `Purchase — ${narration || expenseHead}`,
          referenceId: referenceNo || undefined,
        });
      } else if (voucherType === 'contra') {
        if (!fromAccountId || !toAccountId) { toast.error('Required', 'Select both accounts for contra entry'); return; }
        if (fromAccountId === toAccountId) { toast.error('Invalid', 'From and To accounts must be different'); return; }
        // Debit from, credit to
        await addLedgerTransaction({
          date: new Date(date),
          accountType: 'bank',
          accountId: fromAccountId,
          transactionType: 'debit',
          amount,
          description: `Contra — Transfer to ${bankAccounts.find(b => b.id === toAccountId)?.accountName || ''}`,
          referenceId: referenceNo || undefined,
        });
        await addLedgerTransaction({
          date: new Date(date),
          accountType: 'bank',
          accountId: toAccountId,
          transactionType: 'credit',
          amount,
          description: `Contra — Transfer from ${bankAccounts.find(b => b.id === fromAccountId)?.accountName || ''}`,
          referenceId: referenceNo || undefined,
        });
      } else if (voucherType === 'sales') {
        // Manual Sales voucher — use only for corrections; normally auto-created from billing
        if (!bankAccountId) { toast.error('Required', 'Select the Cash/Bank account that received the payment'); return; }
        await addLedgerTransaction({
          date: new Date(date),
          accountType: 'cash',
          voucherType: 'sales',
          transactionType: 'credit',   // Revenue increases with Credit
          amount,
          description: `Sales — ${narration || 'Manual sales entry'}`,
          referenceId: referenceNo || undefined,
        });
        // Also post the Receipt side
        await addLedgerTransaction({
          date: new Date(date),
          accountType: 'bank',
          accountId: bankAccountId,
          voucherType: 'receipt',
          transactionType: 'credit',
          amount,
          description: `Receipt — ${narration || 'Manual sales entry'}`,
          referenceId: referenceNo || undefined,
        });
      } else {
        // Journal
        await addLedgerTransaction({
          date: new Date(date),
          accountType: 'cash',
          voucherType: 'journal',
          transactionType: 'debit',
          amount,
          description: narration || 'Journal Entry',
          referenceId: referenceNo || undefined,
        });
      }

      toast.success('Voucher Saved', `${VOUCHER_TYPES.find(v => v.id === voucherType)?.label} entry recorded successfully`);
      setShowVoucher(false);
      setVoucherForm({
        voucherType: 'payment', date: new Date().toISOString().slice(0, 10),
        bankAccountId: '', vendorId: '', expenseHead: EXPENSE_HEADS[0],
        fromAccountId: '', toAccountId: '', amount: 0, narration: '', referenceNo: '',
      });
    } catch (e) {
      toast.error('Error', 'Failed to save voucher');
    }
  };

  const handleAddBank = () => {
    if (!bankForm.accountName) return toast.error('Required', 'Account name is required');
    if (editingBank) {
      updateBankAccount(editingBank.id, {
        accountName: bankForm.accountName,
        accountNumber: bankForm.accountNumber,
        bankName: bankForm.bankName,
        openingBalance: bankForm.openingBalance,
      });
      toast.success('Updated', 'Bank account updated');
    } else {
      addBankAccount({ ...bankForm, currentBalance: bankForm.openingBalance });
      toast.success('Added', 'Bank account added');
    }
    setShowAddBank(false);
    setEditingBank(null);
    setBankForm({ accountName: '', accountNumber: '', bankName: '', openingBalance: 0, accountType: 'current' });
  };

  const handleAddVendor = () => {
    if (!vendorForm.name) return toast.error('Required', 'Vendor name is required');
    if (editingVendor) {
      updateVendor(editingVendor.id, vendorForm);
      toast.success('Updated', 'Vendor updated');
    } else {
      addVendor(vendorForm);
      toast.success('Added', 'Vendor added');
    }
    setShowAddVendor(false);
    setEditingVendor(null);
    setVendorForm({ name: '', contactPerson: '', phone: '', email: '', address: '', gstNumber: '', openingBalance: 0 });
  };

  const confirmDelete = (type: string, id: string, name: string) => setDeleteConfirm({ type, id, name });

  const executeDelete = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'vendor') { deleteVendor(deleteConfirm.id); toast.success('Deleted', deleteConfirm.name + ' deleted'); }
    if (deleteConfirm.type === 'bank') { deleteBankAccount(deleteConfirm.id); toast.success('Deleted', deleteConfirm.name + ' deleted'); }
    if (deleteConfirm.type === 'ledger') { deleteLedgerTransaction(deleteConfirm.id); toast.success('Deleted', 'Ledger entry deleted'); }
    setDeleteConfirm(null);
  };

  const openEditBank = (bank: BankAccount) => {
    setEditingBank(bank);
    setBankForm({
      accountName: bank.accountName,
      accountNumber: bank.accountNumber || '',
      bankName: bank.bankName || '',
      openingBalance: bank.openingBalance,
      accountType: 'current'
    });
    setShowAddBank(true);
  };

  const openEditVendor = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setVendorForm({
      name: vendor.name,
      contactPerson: vendor.contactPerson || '',
      phone: vendor.phone || '',
      email: vendor.email || '',
      address: vendor.address || '',
      gstNumber: vendor.gstNumber || '',
      openingBalance: vendor.openingBalance,
    });
    setShowAddVendor(true);
  };

  // ─── NAV ─────────────────────────────────────────────────────────────────────
  const NAV: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <ChartPie size={16} /> },
    { id: 'journal', label: 'Voucher Entry', icon: <Receipt size={16} /> },
    { id: 'ledger', label: 'Day Book', icon: <BookOpen size={16} /> },
    { id: 'bank', label: 'Bank & Cash', icon: <Bank size={16} /> },
    { id: 'vendors', label: 'Vendors / Party', icon: <Buildings size={16} /> },
    { id: 'payables', label: 'Payables', icon: <HandCoins size={16} /> },
  ];

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <>
      <TopBar title="Accounting & Books" />
      <div className="page-body">

        {/* Section nav */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
          {NAV.map(n => (
            <button
              key={n.id}
              onClick={() => setSection(n.id)}
              className={`btn btn-sm ${section === n.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ gap: 6 }}
            >
              {n.icon} {n.label}
            </button>
          ))}
        </div>

        {/* ── DASHBOARD ─────────────────────────────────────────────────────── */}
        {section === 'dashboard' && (
          <>


            {/* ── SALES REVENUE SECTION (auto from bills) ── */}
            <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
              <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div className="card-title">Customer Sales Revenue</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Auto-fetched from all bills — no manual entry needed</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
                  {(['today', 'week', 'month', 'custom'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setRevPeriod(p)}
                      className={`btn btn-sm ${revPeriod === p ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {p === 'today' ? 'Today' : p === 'week' ? 'Last 7 Days' : p === 'month' ? 'This Month' : 'Custom Range'}
                    </button>
                  ))}
                  <button className="btn btn-ghost btn-sm" onClick={loadBillingRevenue} title="Refresh">
                    {loadingBills ? '...' : '↻ Refresh'}
                  </button>
                </div>
              </div>

              {revPeriod === 'custom' && (
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>From:</span>
                  <input className="input" type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ width: 160 }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>To:</span>
                  <input className="input" type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ width: 160 }} />
                </div>
              )}

              <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
                <div style={{ textAlign: 'center', padding: '20px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', borderTop: '3px solid var(--status-free)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Total Revenue</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--status-free)' }}>{loadingBills ? '...' : formatAmount(billingData.total)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{billingData.count} bills</div>
                </div>
                <div style={{ textAlign: 'center', padding: '20px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', borderTop: '3px solid #22c55e' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Cash Received</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#22c55e' }}>{loadingBills ? '...' : formatAmount(billingData.cash)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {billingData.total > 0 ? ((billingData.cash / billingData.total) * 100).toFixed(1) + '%' : '0%'}
                  </div>
                </div>
                <div style={{ textAlign: 'center', padding: '20px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', borderTop: '3px solid #3b82f6' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Card Received</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#3b82f6' }}>{loadingBills ? '...' : formatAmount(billingData.card)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {billingData.total > 0 ? ((billingData.card / billingData.total) * 100).toFixed(1) + '%' : '0%'}
                  </div>
                </div>
                <div style={{ textAlign: 'center', padding: '20px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', borderTop: '3px solid #a855f7' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>UPI Received</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#a855f7' }}>{loadingBills ? '...' : formatAmount(billingData.upi)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {billingData.total > 0 ? ((billingData.upi / billingData.total) * 100).toFixed(1) + '%' : '0%'}
                  </div>
                </div>
              </div>
            </div>

            {/* ── EXPENSE / VOUCHER SUMMARY ── */}
            <div className="grid grid-4" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
              <div className="stat-card" style={{ borderTop: '3px solid var(--status-free)' }}>
                <div className="stat-label">Cash &amp; Bank Balance</div>
                <div className="stat-value" style={{ color: 'var(--status-free)', fontSize: '1.4rem' }}>{formatAmount(totalBankBalance)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{bankAccounts.length} accounts — set up in Bank &amp; Cash tab</div>
              </div>
              <div className="stat-card" style={{ borderTop: '3px solid var(--status-billing)' }}>
                <div className="stat-label">Total Vendor Payables</div>
                <div className="stat-value" style={{ color: 'var(--status-billing)', fontSize: '1.4rem' }}>{formatAmount(totalPayables)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{vendors.length} vendors registered</div>
              </div>
              <div className="stat-card" style={{ borderTop: '3px solid var(--accent)' }}>
                <div className="stat-label">This Month — Manual Receipts</div>
                <div className="stat-value" style={{ color: 'var(--accent)', fontSize: '1.4rem' }}>{formatAmount(monthlyReceipts)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Via Voucher Entry only</div>
              </div>
              <div className="stat-card" style={{ borderTop: '3px solid var(--status-occupied)' }}>
                <div className="stat-label">This Month — Expenses Paid</div>
                <div className="stat-value" style={{ color: 'var(--status-occupied)', fontSize: '1.4rem' }}>{formatAmount(monthlyPayments)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Via Voucher Entry only</div>
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => { setSection('journal'); }}>
                <Plus size={16} /> New Voucher Entry
              </button>
              <button className="btn btn-secondary" onClick={() => setShowAddVendor(true)}>
                <Buildings size={16} /> Add Vendor / Party
              </button>
              <button className="btn btn-secondary" onClick={() => setShowAddBank(true)}>
                <Bank size={16} /> Add Bank Account
              </button>
            </div>

            {/* Recent voucher transactions */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Recent Manual Voucher Entries (Last 10)</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Account</th>
                      <th style={{ textAlign: 'right' }}>Debit (Dr)</th>
                      <th style={{ textAlign: 'right' }}>Credit (Cr)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerTransactions.slice(0, 10).map(tx => {
                      const entityName = tx.accountType === 'vendor'
                        ? vendors.find(v => v.id === tx.accountId)?.name
                        : tx.accountType === 'bank'
                          ? bankAccounts.find(b => b.id === tx.accountId)?.accountName
                          : 'Cash';
                      return (
                        <tr key={tx.id}>
                          <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{new Date(tx.date).toLocaleDateString('en-IN')}</td>
                          <td style={{ maxWidth: 260, fontSize: '0.875rem' }}>{tx.description || '—'}</td>
                          <td>
                            <span className="badge badge-muted" style={{ textTransform: 'capitalize' }}>{entityName || tx.accountType}</span>
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--status-billing)', fontWeight: tx.transactionType === 'debit' ? 700 : 400 }}>
                            {tx.transactionType === 'debit' ? formatAmount(tx.amount) : '—'}
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--status-free)', fontWeight: tx.transactionType === 'credit' ? 700 : 400 }}>
                            {tx.transactionType === 'credit' ? formatAmount(tx.amount) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                    {ledgerTransactions.length === 0 && (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        No manual voucher entries yet. Customer sales revenue is shown above automatically.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── VOUCHER ENTRY (Tally-style) ───────────────────────────────────── */}
        {section === 'journal' && (
          <div className="card" style={{ maxWidth: 640 }}>
            <div className="card-header">
              <div className="card-title">Voucher Entry</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Select the voucher type that matches your transaction</div>
            </div>
            <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Voucher type selector */}
              <div>
                <label className="input-label" style={{ marginBottom: 10, display: 'block' }}>Voucher Type</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {VOUCHER_TYPES.map(vt => (
                    <button
                      key={vt.id}
                      onClick={() => setVoucherForm(f => ({ ...f, voucherType: vt.id }))}
                      className={`btn btn-sm ${voucherForm.voucherType === vt.id ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {vt.icon} {vt.label}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--accent-dim)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  ℹ️ {VOUCHER_TYPES.find(v => v.id === voucherForm.voucherType)?.help}
                </div>
              </div>

              <div className="grid grid-2" style={{ gap: 16 }}>
                <div className="input-group">
                  <label className="input-label">Date</label>
                  <input className="input" type="date" value={voucherForm.date} onChange={e => setVoucherForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="input-group">
                  <label className="input-label">Amount (₹)</label>
                  <input className="input" type="number" min="0" value={voucherForm.amount || ''} placeholder="0.00"
                    onChange={e => setVoucherForm(f => ({ ...f, amount: Number(e.target.value) }))} />
                </div>
              </div>

              {/* Payment fields */}
              {(voucherForm.voucherType === 'payment' || voucherForm.voucherType === 'receipt') && (
                <>
                  <div className="input-group">
                    <label className="input-label">
                      {voucherForm.voucherType === 'payment' ? '💸 Paying From (Cash/Bank)' : '💰 Received In (Cash/Bank)'}
                    </label>
                    <select className="input select" value={voucherForm.bankAccountId} onChange={e => setVoucherForm(f => ({ ...f, bankAccountId: e.target.value }))}>
                      <option value="">— Select Account —</option>
                      {bankAccounts.map(b => (
                        <option key={b.id} value={b.id}>{b.accountName} ({formatAmount(b.currentBalance)})</option>
                      ))}
                    </select>
                  </div>
                  {voucherForm.voucherType === 'payment' && (
                    <>
                      <div className="input-group">
                        <label className="input-label">Expense Head / Category</label>
                        <select className="input select" value={voucherForm.expenseHead} onChange={e => setVoucherForm(f => ({ ...f, expenseHead: e.target.value }))}>
                          {EXPENSE_HEADS.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div className="input-group">
                        <label className="input-label">Paying to Vendor? (Optional)</label>
                        <select className="input select" value={voucherForm.vendorId} onChange={e => setVoucherForm(f => ({ ...f, vendorId: e.target.value }))}>
                          <option value="">— Not a vendor payment —</option>
                          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Purchase fields */}
              {voucherForm.voucherType === 'purchase' && (
                <div className="input-group">
                  <label className="input-label">🛒 Purchase From (Vendor / Party)</label>
                  <select className="input select" value={voucherForm.vendorId} onChange={e => setVoucherForm(f => ({ ...f, vendorId: e.target.value }))}>
                    <option value="">— Select Vendor —</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              )}

              {/* Contra fields */}
              {voucherForm.voucherType === 'contra' && (
                <div className="grid grid-2" style={{ gap: 16 }}>
                  <div className="input-group">
                    <label className="input-label">🔄 Transfer FROM</label>
                    <select className="input select" value={voucherForm.fromAccountId} onChange={e => setVoucherForm(f => ({ ...f, fromAccountId: e.target.value }))}>
                      <option value="">— Select Account —</option>
                      {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.accountName}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Transfer TO</label>
                    <select className="input select" value={voucherForm.toAccountId} onChange={e => setVoucherForm(f => ({ ...f, toAccountId: e.target.value }))}>
                      <option value="">— Select Account —</option>
                      {bankAccounts.filter(b => b.id !== voucherForm.fromAccountId).map(b => <option key={b.id} value={b.id}>{b.accountName}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Narration & Ref */}
              <div className="grid grid-2" style={{ gap: 16 }}>
                <div className="input-group">
                  <label className="input-label">Narration / Notes</label>
                  <input className="input" value={voucherForm.narration} placeholder="Brief description..."
                    onChange={e => setVoucherForm(f => ({ ...f, narration: e.target.value }))} />
                </div>
                <div className="input-group">
                  <label className="input-label">Bill / Ref. No. (Optional)</label>
                  <input className="input" value={voucherForm.referenceNo} placeholder="Invoice / Cheque no."
                    onChange={e => setVoucherForm(f => ({ ...f, referenceNo: e.target.value }))} />
                </div>
              </div>

              <button className="btn btn-primary" style={{ alignSelf: 'flex-start', paddingLeft: 24, paddingRight: 24 }} onClick={handleSubmitVoucher}>
                <CheckCircle size={18} /> Save Voucher
              </button>
            </div>
          </div>
        )}

        {/* ── DAY BOOK (Ledger) ─────────────────────────────────────────────── */}
        {section === 'ledger' && (
          <div className="card">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div className="card-title">Day Book / Ledger</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
                <input className="input" type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={{ width: 150 }} />
                <span style={{ color: 'var(--text-muted)' }}>to</span>
                <input className="input" type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={{ width: 150 }} />
                <select className="input select" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 130 }}>
                  <option value="all">All Types</option>
                  <option value="debit">Debit (Dr)</option>
                  <option value="credit">Credit (Cr)</option>
                </select>
                <select className="input select" value={filterAccount} onChange={e => setFilterAccount(e.target.value)} style={{ width: 160 }}>
                  <option value="all">All Voucher Types</option>
                  <option value="sales">🧾 Sales</option>
                  <option value="receipt">💰 Receipt</option>
                  <option value="payment">💸 Payment</option>
                  <option value="purchase">🛒 Purchase</option>
                  <option value="contra">🔄 Contra</option>
                  <option value="journal">📓 Journal</option>
                </select>
                <select className="input select" value={filterAccount} onChange={e => setFilterAccount(e.target.value)} style={{ width: 140 }}>
                  <option value="all">All Accounts</option>
                  <option value="bank">Bank/Cash</option>
                  <option value="vendor">Vendor</option>
                </select>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voucher</th>
                    <th>Particulars</th>
                    <th>Account</th>
                    <th>Ref. No.</th>
                    <th style={{ textAlign: 'right' }}>Debit (Dr)</th>
                    <th style={{ textAlign: 'right' }}>Credit (Cr)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLedger.map(tx => {
                    const entityName = tx.accountType === 'vendor'
                      ? vendors.find(v => v.id === tx.accountId)?.name
                      : tx.accountType === 'bank'
                        ? bankAccounts.find(b => b.id === tx.accountId)?.accountName
                        : 'Cash';
                    return (
                      <tr key={tx.id}>
                        <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{new Date(tx.date).toLocaleDateString('en-IN')}</td>
                        <td>
                          {tx.voucherType && (
                            <span style={{
                              display: 'inline-block',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: 4,
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                              background: tx.voucherType === 'sales' ? 'rgba(34,197,94,0.15)'
                                : tx.voucherType === 'receipt' ? 'rgba(59,130,246,0.15)'
                                : tx.voucherType === 'payment' ? 'rgba(239,68,68,0.15)'
                                : tx.voucherType === 'purchase' ? 'rgba(234,179,8,0.15)'
                                : tx.voucherType === 'journal' ? 'rgba(168,85,247,0.15)'
                                : 'rgba(100,116,139,0.15)',
                              color: tx.voucherType === 'sales' ? '#16a34a'
                                : tx.voucherType === 'receipt' ? '#2563eb'
                                : tx.voucherType === 'payment' ? '#dc2626'
                                : tx.voucherType === 'purchase' ? '#ca8a04'
                                : tx.voucherType === 'journal' ? '#9333ea'
                                : '#64748b',
                            }}>
                              {VOUCHER_TYPES.find(v => v.id === tx.voucherType)?.icon} {tx.voucherType}
                            </span>
                          )}
                        </td>
                        <td style={{ maxWidth: 260, fontSize: '0.875rem' }}>{tx.description || '—'}</td>
                        <td>
                          <span className={`badge badge-${tx.accountType === 'bank' ? 'free' : 'reserved'}`} style={{ textTransform: 'capitalize', fontSize: '0.7rem' }}>
                            {entityName || tx.accountType}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{tx.referenceId || '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: tx.transactionType === 'debit' ? 700 : 400, color: tx.transactionType === 'debit' ? 'var(--status-billing)' : 'var(--text-muted)' }}>
                          {tx.transactionType === 'debit' ? formatAmount(tx.amount) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: tx.transactionType === 'credit' ? 700 : 400, color: tx.transactionType === 'credit' ? 'var(--status-free)' : 'var(--text-muted)' }}>
                          {tx.transactionType === 'credit' ? formatAmount(tx.amount) : '—'}
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-icon btn-sm" title="Delete" onClick={() => confirmDelete('ledger', tx.id, tx.description || 'this entry')}>
                            <Trash size={14} color="var(--status-occupied)" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredLedger.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No entries in selected range</td></tr>
                  )}
                </tbody>
                {filteredLedger.length > 0 && (
                  <tfoot>
                    <tr style={{ fontWeight: 800, background: 'var(--bg-secondary)' }}>
                      <td colSpan={5} style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>Total ({filteredLedger.length} entries)</td>
                      <td style={{ textAlign: 'right', padding: '10px 16px', color: 'var(--status-billing)' }}>
                        {formatAmount(filteredLedger.filter(t => t.transactionType === 'debit').reduce((s, t) => s + t.amount, 0))}
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 16px', color: 'var(--status-free)' }}>
                        {formatAmount(filteredLedger.filter(t => t.transactionType === 'credit').reduce((s, t) => s + t.amount, 0))}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* ── BANK & CASH ───────────────────────────────────────────────────── */}
        {section === 'bank' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">Bank & Cash Accounts</div>
              <button className="btn btn-primary btn-sm" onClick={() => { setEditingBank(null); setBankForm({ accountName: '', accountNumber: '', bankName: '', openingBalance: 0, accountType: 'current' }); setShowAddBank(true); }}>
                <Plus size={16} /> Add Account
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Account Name</th>
                    <th>Bank / Type</th>
                    <th>Account No.</th>
                    <th style={{ textAlign: 'right' }}>Opening Balance</th>
                    <th style={{ textAlign: 'right' }}>Current Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bankAccounts.map(b => (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 700 }}>{b.accountName}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{b.bankName || 'Cash Account'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{b.accountNumber || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{formatAmount(b.openingBalance)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: b.currentBalance >= 0 ? 'var(--status-free)' : 'var(--status-billing)' }}>
                        {formatAmount(b.currentBalance)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={() => openEditBank(b)}>
                            <PencilSimple size={15} />
                          </button>
                          <button className="btn btn-ghost btn-icon btn-sm" title="Delete" onClick={() => confirmDelete('bank', b.id, b.accountName)}>
                            <Trash size={15} color="var(--status-occupied)" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {bankAccounts.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No bank/cash accounts added yet</td></tr>
                  )}
                </tbody>
                {bankAccounts.length > 0 && (
                  <tfoot>
                    <tr style={{ fontWeight: 800, background: 'var(--bg-secondary)' }}>
                      <td colSpan={4} style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>Total Balance</td>
                      <td style={{ textAlign: 'right', padding: '10px 16px', color: 'var(--status-free)' }}>{formatAmount(totalBankBalance)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* ── VENDORS ───────────────────────────────────────────────────────── */}
        {section === 'vendors' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">Vendor / Party Master</div>
              <button className="btn btn-primary btn-sm" onClick={() => { setEditingVendor(null); setVendorForm({ name: '', contactPerson: '', phone: '', email: '', address: '', gstNumber: '', openingBalance: 0 }); setShowAddVendor(true); }}>
                <Plus size={16} /> Add Vendor
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Party Name</th>
                    <th>Contact</th>
                    <th>GST No.</th>
                    <th style={{ textAlign: 'right' }}>Opening Balance</th>
                    <th style={{ textAlign: 'right' }}>Purchases</th>
                    <th style={{ textAlign: 'right' }}>Paid</th>
                    <th style={{ textAlign: 'right' }}>Outstanding (Cr.)</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorBalances.map(({ vendor: v, balance, purchased, paid }) => (
                    <tr key={v.id}>
                      <td style={{ fontWeight: 700 }}>{v.name}</td>
                      <td>
                        <div style={{ fontSize: '0.8rem' }}>{v.contactPerson || '—'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{v.phone || v.email || '—'}</div>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{v.gstNumber || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{formatAmount(v.openingBalance)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--status-billing)' }}>{formatAmount(purchased)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--status-free)' }}>{formatAmount(paid)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: balance > 0 ? 'var(--status-billing)' : 'var(--status-free)' }}>
                        {formatAmount(balance)}
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                          {balance > 0 ? 'You owe them' : balance < 0 ? 'They owe you' : 'Settled'}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={() => openEditVendor(v)}>
                            <PencilSimple size={15} />
                          </button>
                          <button className="btn btn-ghost btn-icon btn-sm" title="Delete" onClick={() => confirmDelete('vendor', v.id, v.name)}>
                            <Trash size={15} color="var(--status-occupied)" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {vendors.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No vendors added yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PAYABLES STATEMENT ────────────────────────────────────────────── */}
        {section === 'payables' && (
          <>
            <div className="grid grid-3" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
              <div className="stat-card" style={{ borderTop: '3px solid var(--status-billing)' }}>
                <div className="stat-label">Total Outstanding Payables</div>
                <div className="stat-value" style={{ color: 'var(--status-billing)' }}>{formatAmount(totalPayables)}</div>
              </div>
              <div className="stat-card" style={{ borderTop: '3px solid var(--status-free)' }}>
                <div className="stat-label">Fully Settled Vendors</div>
                <div className="stat-value" style={{ color: 'var(--status-free)' }}>{vendorBalances.filter(v => v.balance <= 0).length}</div>
              </div>
              <div className="stat-card" style={{ borderTop: '3px solid var(--status-reserved)' }}>
                <div className="stat-label">Vendors with Outstanding</div>
                <div className="stat-value" style={{ color: 'var(--status-reserved)' }}>{vendorBalances.filter(v => v.balance > 0).length}</div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">Creditors / Payables Ledger</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Party Name</th>
                      <th>Phone</th>
                      <th style={{ textAlign: 'right' }}>Opening (Dr.)</th>
                      <th style={{ textAlign: 'right' }}>Purchases (Cr.)</th>
                      <th style={{ textAlign: 'right' }}>Payments (Dr.)</th>
                      <th style={{ textAlign: 'right' }}>Balance (Cr.)</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendorBalances
                      .sort((a, b) => b.balance - a.balance)
                      .map(({ vendor: v, balance, purchased, paid }, i) => (
                        <tr key={v.id}>
                          <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td style={{ fontWeight: 700 }}>{v.name}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{v.phone || '—'}</td>
                          <td style={{ textAlign: 'right' }}>{formatAmount(v.openingBalance)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--status-billing)' }}>{formatAmount(purchased)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--status-free)' }}>{formatAmount(paid)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: balance > 0 ? 'var(--status-billing)' : 'var(--status-free)' }}>
                            {formatAmount(Math.abs(balance))} {balance > 0 ? 'Cr.' : balance < 0 ? 'Dr.' : ''}
                          </td>
                          <td>
                            <span className={`badge badge-${balance <= 0 ? 'free' : balance > 5000 ? 'occupied' : 'reserved'}`}>
                              {balance <= 0 ? 'Settled' : balance > 5000 ? 'High' : 'Pending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    {vendors.length === 0 && (
                      <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No vendor data</td></tr>
                    )}
                  </tbody>
                  {vendors.length > 0 && (
                    <tfoot>
                      <tr style={{ fontWeight: 800, background: 'var(--bg-secondary)' }}>
                        <td colSpan={3} style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>Grand Total</td>
                        <td style={{ textAlign: 'right', padding: '10px 16px' }}>
                          {formatAmount(vendors.reduce((s, v) => s + v.openingBalance, 0))}
                        </td>
                        <td style={{ textAlign: 'right', padding: '10px 16px', color: 'var(--status-billing)' }}>
                          {formatAmount(vendorBalances.reduce((s, v) => s + v.purchased, 0))}
                        </td>
                        <td style={{ textAlign: 'right', padding: '10px 16px', color: 'var(--status-free)' }}>
                          {formatAmount(vendorBalances.reduce((s, v) => s + v.paid, 0))}
                        </td>
                        <td style={{ textAlign: 'right', padding: '10px 16px', color: 'var(--status-billing)', fontWeight: 900 }}>
                          {formatAmount(totalPayables)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── ADD / EDIT BANK MODAL ─────────────────────────────────────────────── */}
      {showAddBank && (
        <div className="modal-overlay" onClick={() => { setShowAddBank(false); setEditingBank(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: '95%' }}>
            <div className="modal-header">
              <span className="modal-title"><Bank size={18} style={{ display: 'inline', marginRight: 8 }} />{editingBank ? 'Edit' : 'Add'} Bank / Cash Account</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setShowAddBank(false); setEditingBank(null); }}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Account Nickname *</label>
                <input className="input" placeholder="e.g. HDFC Current, Petty Cash" value={bankForm.accountName} onChange={e => setBankForm({ ...bankForm, accountName: e.target.value })} />
              </div>
              <div className="grid grid-2" style={{ gap: 16 }}>
                <div className="input-group">
                  <label className="input-label">Bank Name</label>
                  <input className="input" placeholder="e.g. HDFC Bank" value={bankForm.bankName} onChange={e => setBankForm({ ...bankForm, bankName: e.target.value })} />
                </div>
                <div className="input-group">
                  <label className="input-label">Account Type</label>
                  <select className="input select" value={bankForm.accountType} onChange={e => setBankForm({ ...bankForm, accountType: e.target.value as any })}>
                    <option value="current">Current</option>
                    <option value="savings">Savings</option>
                    <option value="cash">Cash in Hand</option>
                  </select>
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Account Number</label>
                <input className="input" value={bankForm.accountNumber} onChange={e => setBankForm({ ...bankForm, accountNumber: e.target.value })} />
              </div>
              <div className="input-group">
                <label className="input-label">Opening Balance (₹)</label>
                <input className="input" type="number" value={bankForm.openingBalance} onChange={e => setBankForm({ ...bankForm, openingBalance: Number(e.target.value) })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowAddBank(false); setEditingBank(null); }}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAddBank}>{editingBank ? 'Update Account' : 'Save Account'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD / EDIT VENDOR MODAL ───────────────────────────────────────────── */}
      {showAddVendor && (
        <div className="modal-overlay" onClick={() => { setShowAddVendor(false); setEditingVendor(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: '95%' }}>
            <div className="modal-header">
              <span className="modal-title"><Buildings size={18} style={{ display: 'inline', marginRight: 8 }} />{editingVendor ? 'Edit' : 'Add'} Vendor / Party</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setShowAddVendor(false); setEditingVendor(null); }}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '60vh', overflowY: 'auto' }}>
              <div className="input-group">
                <label className="input-label">Business / Party Name *</label>
                <input className="input" value={vendorForm.name} onChange={e => setVendorForm({ ...vendorForm, name: e.target.value })} />
              </div>
              <div className="grid grid-2" style={{ gap: 16 }}>
                <div className="input-group">
                  <label className="input-label">Contact Person</label>
                  <input className="input" value={vendorForm.contactPerson} onChange={e => setVendorForm({ ...vendorForm, contactPerson: e.target.value })} />
                </div>
                <div className="input-group">
                  <label className="input-label">Phone</label>
                  <input className="input" type="tel" value={vendorForm.phone} onChange={e => setVendorForm({ ...vendorForm, phone: e.target.value })} />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">GST Number</label>
                <input className="input" placeholder="22AAAAA0000A1Z5" value={vendorForm.gstNumber} onChange={e => setVendorForm({ ...vendorForm, gstNumber: e.target.value.toUpperCase() })} />
              </div>
              <div className="input-group">
                <label className="input-label">Address</label>
                <input className="input" value={vendorForm.address} onChange={e => setVendorForm({ ...vendorForm, address: e.target.value })} />
              </div>
              <div className="input-group">
                <label className="input-label">Opening Balance — Amount you already owe them (₹)</label>
                <input className="input" type="number" min="0" value={vendorForm.openingBalance} onChange={e => setVendorForm({ ...vendorForm, openingBalance: Number(e.target.value) })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowAddVendor(false); setEditingVendor(null); }}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAddVendor}>{editingVendor ? 'Update Vendor' : 'Save Vendor'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM ────────────────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 400, maxWidth: '90%' }}>
            <div className="modal-header">
              <span className="modal-title" style={{ color: 'var(--status-occupied)' }}>
                <Trash size={18} style={{ display: 'inline', marginRight: 8 }} />Confirm Delete
              </span>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)' }}>
                Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-sm" style={{ background: 'var(--status-occupied)', color: '#fff' }} onClick={executeDelete}>
                <Trash size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
