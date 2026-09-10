import React, { useState, useEffect } from 'react';
import { formatAmount, GST_STATE_CODES } from '../lib/gst';
import { ChartBar, Download, Calendar, TrendUp, Package, FilePdf } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { useBillStore } from '../store/billStore';
import { useAuthStore } from '../store/authStore';
import { useMenuStore } from '../store/menuStore';
import { useAccountingStore } from '../store/accountingStore';
import { useSettingsStore } from '../store/settingsStore';
import { Bill } from '../types';
import jsPDF from 'jspdf';

type ReportTab = 'overview' | 'items';
type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';

function getDateRange(preset: DatePreset, customFrom: string, customTo: string): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  if (preset === 'today') { start.setHours(0, 0, 0, 0); }
  else if (preset === 'yesterday') { start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0); end.setDate(end.getDate() - 1); end.setHours(23, 59, 59, 999); }
  else if (preset === 'week') { start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0); }
  else if (preset === 'month') { start.setMonth(start.getMonth() - 1); start.setHours(0, 0, 0, 0); }
  else if (preset === 'year') { start.setFullYear(start.getFullYear() - 1); start.setHours(0, 0, 0, 0); }
  else if (preset === 'custom') { const f = new Date(customFrom); const t = new Date(customTo); f.setHours(0, 0, 0, 0); t.setHours(23, 59, 59, 999); return { start: f, end: t }; }
  return { start, end };
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '10px 14px' }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ fontSize: 14, fontWeight: 700, color: p.color || 'var(--accent)' }}>
            {p.name === 'revenue' ? formatAmount(p.value) : `${p.value} ${p.name}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function Reports() {
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [datePreset, setDatePreset] = useState<DatePreset>('week');
  const [customFrom, setCustomFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); });
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [itemDatePreset, setItemDatePreset] = useState<DatePreset>('week');
  const [itemCustomFrom, setItemCustomFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); });
  const [itemCustomTo, setItemCustomTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [itemCategoryFilter, setItemCategoryFilter] = useState<string>('all');
  const [itemSearch, setItemSearch] = useState('');
  const [itemSortBy, setItemSortBy] = useState<'qty' | 'gross' | 'net' | 'gst' | 'name'>('qty');

  const { fetchBillsByDateRange, bills: localBills } = useBillStore();
  const { categories, items: menuItems } = useMenuStore();
  const currentUser = useAuthStore(s => s.currentUser);
  const { bankAccounts, ledgerTransactions } = useAccountingStore();
  const { settings } = useSettingsStore();
  const [bills, setBills] = useState<Bill[]>([]);
  const [itemBills, setItemBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemLoading, setItemLoading] = useState(true);

  const isAdminOrManager = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  useEffect(() => { loadBills(); }, [datePreset, customFrom, customTo]);
  useEffect(() => { if (activeTab === 'items') loadItemBills(); }, [activeTab, itemDatePreset, itemCustomFrom, itemCustomTo]);

  const fetchFiltered = async (start: Date, end: Date): Promise<Bill[]> => {
    let result: Bill[] = [];
    try {
      const supabaseBills = await fetchBillsByDateRange(start, end);
      const localFiltered = localBills.filter(b => { const d = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt); return d >= start && d <= end; });
      const allById: Record<string, Bill> = {};
      localFiltered.forEach(b => { allById[b.id] = b; });
      supabaseBills.forEach(b => { allById[b.id] = b; });
      result = Object.values(allById);
    } catch {
      result = localBills.filter(b => { const d = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt); return d >= start && d <= end; });
    }
    return result.filter(b => b.status !== 'void');
  };

  const loadBills = async () => { setLoading(true); const { start, end } = getDateRange(datePreset, customFrom, customTo); setBills(await fetchFiltered(start, end)); setLoading(false); };
  const loadItemBills = async () => { setItemLoading(true); const { start, end } = getDateRange(itemDatePreset, itemCustomFrom, itemCustomTo); setItemBills(await fetchFiltered(start, end)); setItemLoading(false); };

  // Overview
  const totalRevenue = bills.reduce((s, b) => s + b.totalAmount, 0);
  const totalOrders = bills.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const totalCovers = bills.reduce((s, b) => s + (b.guestCount || 0), 0);
  const dailyDataMap = new Map<string, { date: string; revenue: number; orders: number; covers: number }>();
  bills.forEach(b => {
    const dString = (b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    if (!dailyDataMap.has(dString)) dailyDataMap.set(dString, { date: dString, revenue: 0, orders: 0, covers: 0 });
    const d = dailyDataMap.get(dString)!; d.revenue += b.totalAmount; d.orders += 1; d.covers += b.items.reduce((sum, item) => sum + item.quantity, 0);
  });
  const DAILY_DATA = Array.from(dailyDataMap.values());
  const paymentMap = new Map<string, number>(); let totalPayments = 0;
  bills.forEach(b => { b.payments.forEach(p => { paymentMap.set(p.mode, (paymentMap.get(p.mode) || 0) + p.amount); totalPayments += p.amount; }); });
  const paymentColors: Record<string, string> = { cash: '#22c55e', upi: '#e6a817', card: '#3b82f6', split: '#8b5cf6' };
  const PAYMENT_DATA = Array.from(paymentMap.entries()).map(([mode, amount]) => ({ name: mode.charAt(0).toUpperCase() + mode.slice(1), value: totalPayments > 0 ? Math.round((amount / totalPayments) * 100) : 0, color: paymentColors[mode] || '#64748b' }));
  const staffMap = new Map<string, { name: string; orders: number; revenue: number; tables: Set<string> }>();
  bills.forEach(b => { if (!staffMap.has(b.staffName)) staffMap.set(b.staffName, { name: b.staffName, orders: 0, revenue: 0, tables: new Set() }); const s = staffMap.get(b.staffName)!; s.orders += 1; s.revenue += b.totalAmount; if (b.tableId) s.tables.add(b.tableId); });
  const TOP_STAFF = Array.from(staffMap.values()).map(s => ({ ...s, tables: s.tables.size })).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const gstMap = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; total: number }>();
  bills.forEach(b => { if (b.gstBreakdown) b.gstBreakdown.forEach(g => { if (!gstMap.has(g.rate)) gstMap.set(g.rate, { rate: g.rate, taxable: 0, cgst: 0, sgst: 0, total: 0 }); const gm = gstMap.get(g.rate)!; gm.taxable += g.taxableAmount; gm.cgst += g.cgst; gm.sgst += g.sgst; gm.total += (g.cgst + g.sgst + g.igst); }); });
  const GST_DATA = Array.from(gstMap.values()).map(g => ({ ...g, rate: `${g.rate}%` })).sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate));
  const itemMapOv = new Map<string, { name: string; qty: number; revenue: number }>();
  bills.forEach(b => { b.items?.forEach(item => { if (!itemMapOv.has(item.menuItemId)) itemMapOv.set(item.menuItemId, { name: item.menuItemName, qty: 0, revenue: 0 }); const im = itemMapOv.get(item.menuItemId)!; im.qty += item.quantity; im.revenue += item.totalPrice; }); });
  const TOP_DISHES = Array.from(itemMapOv.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);


  // Item stats
  interface ItemStat { id: string; name: string; categoryId: string; qty: number; gross: number; gst: number; net: number; }
  const itemStatsMap = new Map<string, Omit<ItemStat, 'id'>>();
  itemBills.forEach(b => { b.items?.forEach(item => { if (!itemStatsMap.has(item.menuItemId)) itemStatsMap.set(item.menuItemId, { name: item.menuItemName, categoryId: '', qty: 0, gross: 0, gst: 0, net: 0 }); const stat = itemStatsMap.get(item.menuItemId)!; stat.qty += item.quantity; stat.gross += item.totalPrice; const rate = item.gstRate || 0; const itemGst = rate > 0 ? item.totalPrice - item.totalPrice / (1 + rate / 100) : 0; stat.gst += itemGst; stat.net += item.totalPrice - itemGst; }); });
  let ITEM_STATS: ItemStat[] = Array.from(itemStatsMap.entries()).map(([id, stat]) => { const menuItem = menuItems.find(m => m.id === id); return { id, ...stat, categoryId: menuItem?.categoryId || '' }; });
  if (itemCategoryFilter !== 'all') ITEM_STATS = ITEM_STATS.filter(s => s.categoryId === itemCategoryFilter);
  if (itemSearch.trim()) ITEM_STATS = ITEM_STATS.filter(s => s.name.toLowerCase().includes(itemSearch.toLowerCase()));
  ITEM_STATS = ITEM_STATS.sort((a, b) => itemSortBy === 'qty' ? b.qty - a.qty : itemSortBy === 'gross' ? b.gross - a.gross : itemSortBy === 'net' ? b.net - a.net : itemSortBy === 'gst' ? b.gst - a.gst : a.name.localeCompare(b.name));
  const itemTotalQty = ITEM_STATS.reduce((s, i) => s + i.qty, 0);
  const itemTotalGross = ITEM_STATS.reduce((s, i) => s + i.gross, 0);
  const itemTotalGST = ITEM_STATS.reduce((s, i) => s + i.gst, 0);
  const itemTotalNet = ITEM_STATS.reduce((s, i) => s + i.net, 0);

  const downloadCSV = (lines: string[], name: string) => { const blob = new Blob([lines.join('\n')], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${name}-${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.csv`; a.click(); URL.revokeObjectURL(url); };
  const handleExportOverviewCSV = () => { const lines = ['RESTAURANT SALES REPORT', `Total Revenue,${totalRevenue.toFixed(2)}`, `Total Orders,${totalOrders}`, `Total Covers,${totalCovers}`, '', 'DAILY BREAKDOWN', 'Date,Revenue,Orders', ...DAILY_DATA.map(d => `${d.date},${d.revenue.toFixed(2)},${d.orders}`), '', 'GST SUMMARY', 'Rate,Taxable,CGST,SGST,Total', ...GST_DATA.map(g => `${g.rate},${g.taxable.toFixed(2)},${g.cgst.toFixed(2)},${g.sgst.toFixed(2)},${g.total.toFixed(2)}`)]; downloadCSV(lines, `sales-report-${datePreset}`); };

  // ── GSTR-1 CSV Export (Table 7 & Table 13 for B2C Intra-State) ────────────────
  const handleExportGSTR1CSV = async () => {
    const { start, end } = getDateRange(datePreset, customFrom, customTo);
    let gstrBills: Bill[] = [];
    try { gstrBills = await fetchBillsByDateRange(start, end); } catch { gstrBills = localBills; }

    // Resolve POS State Code
    const bState = settings.businessState || '';
    const stateCodeMatch = Object.entries(GST_STATE_CODES).find(([code, name]) => name.toLowerCase() === bState.toLowerCase());
    const posString = stateCodeMatch ? `${stateCodeMatch[0]}-${stateCodeMatch[1]}` : bState;

    // --- TABLE 7: B2C (Others) ---
    // Filter active GST bills
    const activeGSTBills = gstrBills.filter(b => b.status !== 'void' && b.isGstBill !== false);
    
    // Group items by tax rate
    const table7Map = new Map<number, { taxable: number, cgst: number, sgst: number }>();
    
    activeGSTBills.forEach(b => {
      b.items?.forEach(item => {
        if (item.status === 'void') return;
        const rate = item.gstRate || 0;
        
        const taxable = item.totalPrice / (1 + rate / 100);
        const tax = item.totalPrice - taxable;
        const cgst = tax / 2;
        const sgst = tax / 2;

        if (!table7Map.has(rate)) {
          table7Map.set(rate, { taxable: 0, cgst: 0, sgst: 0 });
        }
        const group = table7Map.get(rate)!;
        group.taxable += taxable;
        group.cgst += cgst;
        group.sgst += sgst;
      });
    });

    const t7Header = 'Place of Supply (POS),Supply Type,Tax Rate,Total Taxable Value,CGST Amount,SGST Amount,Cess Amount,E-Commerce GSTIN';
    const t7Rows = Array.from(table7Map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([rate, vals]) => {
        return `${posString},Intra-State,${rate}%,${vals.taxable.toFixed(2)},${vals.cgst.toFixed(2)},${vals.sgst.toFixed(2)},0.00,`;
      });

    // --- TABLE 13: Documents Issued ---
    const allInvoiceNumbers = gstrBills.map(b => b.invoiceNumber).sort();
    const minInvoice = allInvoiceNumbers.length > 0 ? allInvoiceNumbers[0] : '';
    const maxInvoice = allInvoiceNumbers.length > 0 ? allInvoiceNumbers[allInvoiceNumbers.length - 1] : '';
    const totalCount = gstrBills.length;
    const cancelledCount = gstrBills.filter(b => b.status === 'void').length;
    const netIssued = totalCount - cancelledCount;

    const t13Header = 'Type of Document,From Serial No.,To Serial No.,Total Count,Cancelled Count,Net Issued';
    const t13Row = `B2C Invoices,${minInvoice},${maxInvoice},${totalCount},${cancelledCount},${netIssued}`;

    // Combine into standard format payload
    const csvContent = [
      `GSTR-1 EXPORT — ${settings.restaurantName}`,
      `GSTIN: ${settings.gstin || 'N/A'}`,
      `Period: ${start.toLocaleDateString('en-IN')} to ${end.toLocaleDateString('en-IN')}`,
      '',
      'b2cs',
      t7Header,
      ...t7Rows,
      '',
      'doc_iss',
      t13Header,
      t13Row
    ];

    downloadCSV(csvContent, `GSTR1-${datePreset}`);
  };

  // ── jsPDF Auditor Report ─────────────────────────────────────────────────────
  const handleDownloadAuditorPDF = async () => {
    const { start, end } = getDateRange(datePreset, customFrom, customTo);
    let auditBills: Bill[] = [];
    try { auditBills = await fetchBillsByDateRange(start, end); } catch { auditBills = localBills; }
    const activeBills = auditBills.filter(b => b.status !== 'void');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();
    let y = 18;
    const lm = 14; // left margin
    const col2 = 100;

    const addLine = (text: string, size = 10, bold = false, align: 'left' | 'center' | 'right' = 'left') => {
      doc.setFontSize(size);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      if (align === 'center') doc.text(text, pw / 2, y, { align: 'center' });
      else if (align === 'right') doc.text(text, pw - lm, y, { align: 'right' });
      else doc.text(text, lm, y);
      y += size * 0.5 + 2;
    };

    const checkPage = () => { if (y > 270) { doc.addPage(); y = 18; } };

    // ── Header ──
    addLine(settings.restaurantName, 16, true, 'center');
    addLine(settings.address || '', 9, false, 'center');
    addLine(`GSTIN: ${settings.gstin || 'N/A'}`, 9, false, 'center');
    y += 3;
    doc.setDrawColor(100); doc.line(lm, y, pw - lm, y); y += 6;
    addLine('AUDITOR REPORT', 13, true, 'center');
    addLine(`Period: ${start.toLocaleDateString('en-IN')} to ${end.toLocaleDateString('en-IN')}`, 9, false, 'center');
    addLine(`Generated: ${new Date().toLocaleString('en-IN')}`, 9, false, 'center');
    y += 3; doc.line(lm, y, pw - lm, y); y += 6;

    // ── 1. Sales Summary ──
    addLine('1. SALES SUMMARY', 11, true);
    y += 2;
    const totalRev = activeBills.reduce((s, b) => s + b.totalAmount, 0);
    const totalGSTAll = activeBills.reduce((s, b) => s + b.totalGST, 0);
    const cashTotal = activeBills.reduce((s, b) => s + (b.payments?.filter(p => p.mode === 'cash').reduce((a, p) => a + p.amount, 0) || 0), 0);
    const upiTotal = activeBills.reduce((s, b) => s + (b.payments?.filter(p => p.mode === 'upi').reduce((a, p) => a + p.amount, 0) || 0), 0);
    const cardTotal = activeBills.reduce((s, b) => s + (b.payments?.filter(p => p.mode === 'card').reduce((a, p) => a + p.amount, 0) || 0), 0);
    const rows1: [string, string][] = [
      ['Total Invoices', activeBills.length.toString()],
      ['Total Revenue', `Rs. ${totalRev.toFixed(2)}`],
      ['Total GST Collected', `Rs. ${totalGSTAll.toFixed(2)}`],
      ['Net Revenue (Ex-GST)', `Rs. ${(totalRev - totalGSTAll).toFixed(2)}`],
      ['Cash Collections', `Rs. ${cashTotal.toFixed(2)}`],
      ['UPI Collections', `Rs. ${upiTotal.toFixed(2)}`],
      ['Card Collections', `Rs. ${cardTotal.toFixed(2)}`],
    ];
    rows1.forEach(([k, v]) => { checkPage(); doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text(k, lm + 4, y); doc.text(v, col2, y); y += 6; });
    y += 4; checkPage();

    // ── 2. GST Summary ──
    doc.line(lm, y, pw - lm, y); y += 5;
    addLine('2. GST SUMMARY (Rate-wise)', 11, true);
    y += 2;
    const gstMap = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();
    activeBills.forEach(b => {
      if (!b.isGstBill) return;
      b.gstBreakdown?.forEach(g => {
        if (!gstMap.has(g.rate)) gstMap.set(g.rate, { taxable: 0, cgst: 0, sgst: 0, igst: 0 });
        const e = gstMap.get(g.rate)!;
        e.taxable += g.taxableAmount; e.cgst += g.cgst; e.sgst += g.sgst; e.igst += g.igst;
      });
      // If breakdown empty but cgstAmount stored, use that
      if (!b.gstBreakdown?.length && (b.cgstAmount || b.igstAmount)) {
        if (!gstMap.has(0)) gstMap.set(0, { taxable: 0, cgst: 0, sgst: 0, igst: 0 });
        const e = gstMap.get(0)!;
        e.cgst += b.cgstAmount ?? 0; e.sgst += b.sgstAmount ?? 0; e.igst += b.igstAmount ?? 0;
      }
    });
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    ['Rate', 'Taxable (Rs)', 'CGST (Rs)', 'SGST (Rs)', 'IGST (Rs)'].forEach((h, i) => { doc.text(h, lm + 4 + i * 36, y); });
    y += 5;
    doc.setFont('helvetica', 'normal');
    Array.from(gstMap.entries()).sort((a,b) => a[0]-b[0]).forEach(([rate, g]) => {
      checkPage();
      [rate + '%', g.taxable.toFixed(2), g.cgst.toFixed(2), g.sgst.toFixed(2), g.igst.toFixed(2)]
        .forEach((v, i) => doc.text(v, lm + 4 + i * 36, y));
      y += 5;
    });
    y += 4; checkPage();

    // ── 3. Bank Account Balances ──
    doc.line(lm, y, pw - lm, y); y += 5;
    addLine('3. BANK & CASH ACCOUNT BALANCES', 11, true);
    y += 2;
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('Account', lm + 4, y); doc.text('Bank', lm + 60, y); doc.text('Opening (Rs)', lm + 110, y); doc.text('Current (Rs)', lm + 148, y);
    y += 5; doc.setFont('helvetica', 'normal');
    bankAccounts.forEach(b => {
      checkPage();
      doc.text(b.accountName.slice(0,18), lm + 4, y);
      doc.text((b.bankName || 'Cash').slice(0,14), lm + 60, y);
      doc.text(b.openingBalance.toFixed(2), lm + 110, y);
      doc.text(b.currentBalance.toFixed(2), lm + 148, y);
      y += 5;
    });
    const totalBal = bankAccounts.reduce((s, b) => s + b.currentBalance, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL', lm + 4, y);
    doc.text(totalBal.toFixed(2), lm + 148, y);
    y += 6; checkPage();

    // ── 4. Ledger Transactions Summary ──
    doc.line(lm, y, pw - lm, y); y += 5;
    addLine('4. LEDGER TRANSACTIONS SUMMARY', 11, true);
    y += 2;
    const periodTxs = ledgerTransactions.filter(t => {
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      return d >= start && d <= end;
    });
    const totalDebits = periodTxs.filter(t => t.transactionType === 'debit').reduce((s, t) => s + t.amount, 0);
    const totalCredits = periodTxs.filter(t => t.transactionType === 'credit').reduce((s, t) => s + t.amount, 0);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Total Entries: ${periodTxs.length}`, lm + 4, y); y += 5;
    doc.text(`Total Debits (Payments): Rs. ${totalDebits.toFixed(2)}`, lm + 4, y); y += 5;
    doc.text(`Total Credits (Receipts): Rs. ${totalCredits.toFixed(2)}`, lm + 4, y); y += 5;
    doc.text(`Net: Rs. ${(totalCredits - totalDebits).toFixed(2)}`, lm + 4, y); y += 8; checkPage();

    // Recent transactions (up to 30)
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('Date', lm + 4, y); doc.text('Type', lm + 30, y); doc.text('Description', lm + 55, y); doc.text('Debit (Rs)', lm + 130, y); doc.text('Credit (Rs)', lm + 162, y);
    y += 5; doc.setFont('helvetica', 'normal');
    periodTxs.slice(0, 30).forEach(t => {
      checkPage();
      const d = (t.date instanceof Date ? t.date : new Date(t.date)).toLocaleDateString('en-IN');
      doc.text(d, lm + 4, y);
      doc.text((t.voucherType || t.accountType).slice(0, 10), lm + 30, y);
      doc.text((t.description || '—').slice(0, 32), lm + 55, y);
      if (t.transactionType === 'debit') doc.text(t.amount.toFixed(2), lm + 130, y);
      else doc.text(t.amount.toFixed(2), lm + 162, y);
      y += 5;
    });
    if (periodTxs.length > 30) { checkPage(); doc.setFontSize(8); doc.text(`... and ${periodTxs.length - 30} more entries`, lm + 4, y); y += 6; }

    // ── Footer ──
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text(`Page ${i} of ${totalPages}  |  Confidential Auditor Report  |  ${settings.restaurantName}`, pw / 2, 290, { align: 'center' });
    }

    doc.save(`Auditor-Report-${start.toLocaleDateString('en-IN').replace(/\//g, '-')}-to-${end.toLocaleDateString('en-IN').replace(/\//g, '-')}.pdf`);
  };

  const handleExportItemCSV = () => { const lines = ['ITEM-WISE SALES REPORT', `Period: ${itemDatePreset}`, '', 'Item Name,Category,Qty Sold,Gross Revenue,Net Revenue,GST Amount', ...ITEM_STATS.map(s => { const cat = categories.find(c => c.id === s.categoryId)?.name || 'Unknown'; return `${s.name},${cat},${s.qty},${s.gross.toFixed(2)},${s.net.toFixed(2)},${s.gst.toFixed(2)}`; }), `TOTAL,,${itemTotalQty},${itemTotalGross.toFixed(2)},${itemTotalNet.toFixed(2)},${itemTotalGST.toFixed(2)}`]; downloadCSV(lines, `item-report-${itemDatePreset}`); };

  const PRESETS: { label: string; value: DatePreset }[] = [{ label: 'Today', value: 'today' }, { label: 'Yesterday', value: 'yesterday' }, { label: 'This Week', value: 'week' }, { label: 'This Month', value: 'month' }, { label: 'This Year', value: 'year' }, { label: 'Custom', value: 'custom' }];
  const tabs: { id: ReportTab; label: string; icon: React.ReactNode }[] = [{ id: 'items', label: 'Item-wise Report', icon: <Package size={16} /> }];

  return (
    <>
      <TopBar
        title="Reports & Analytics"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="tabs" style={{ padding: 3 }}>
                  {(['week', 'month', 'year'] as DatePreset[]).map(r => (
                    <button key={r} className={`tab-item ${datePreset === r ? 'active' : ''}`} onClick={() => setDatePreset(r)} style={{ padding: '6px 12px', fontSize: '0.8125rem', textTransform: 'capitalize' }}>{r}</button>
                  ))}
                </div>
                <button className="btn btn-secondary btn-sm" onClick={handleExportOverviewCSV}><Download size={16} /> Export CSV</button>
                <button className="btn btn-secondary btn-sm" onClick={handleExportGSTR1CSV} title="Export GSTR-1 for current period (GST bills only)"><Download size={16} /> GSTR-1 CSV</button>
                <button className="btn btn-secondary btn-sm" onClick={handleDownloadAuditorPDF} style={{ color: 'var(--accent)' }} title="Download full Auditor Report as PDF"><FilePdf size={16} /> Auditor PDF</button>
              </div>
            )}

          </div>
        }
      />
      <div className="page-body">
        <div className="tabs" style={{ padding: 3, marginBottom: 'var(--space-5)', display: 'inline-flex' }}>
          {tabs.map(t => (
            <button key={t.id} className={`tab-item ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}
              style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}


        {/* ITEM-WISE REPORT TAB */}
        {activeTab === 'items' && (
          <>
            <div className="card" style={{ marginBottom: 'var(--space-4)', padding: '16px' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                <Calendar size={16} style={{ color: 'var(--text-muted)', marginRight: 4 }} />
                {PRESETS.map(p => (
                  <button key={p.value} className={`btn btn-sm ${itemDatePreset === p.value ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setItemDatePreset(p.value)}>{p.label}</button>
                ))}
                <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={handleExportItemCSV}><Download size={16} /> Export CSV</button>
              </div>
              {itemDatePreset === 'custom' && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>From</span>
                  <input type="date" className="input" style={{ width: 160 }} value={itemCustomFrom} onChange={e => setItemCustomFrom(e.target.value)} />
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>To</span>
                  <input type="date" className="input" style={{ width: 160 }} value={itemCustomTo} onChange={e => setItemCustomTo(e.target.value)} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="input" style={{ width: 180 }} value={itemCategoryFilter} onChange={e => setItemCategoryFilter(e.target.value)}>
                  <option value="all">All Categories</option>
                  {categories.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="Search item name..." value={itemSearch} onChange={e => setItemSearch(e.target.value)} />
                <select className="input" style={{ width: 180 }} value={itemSortBy} onChange={e => setItemSortBy(e.target.value as any)}>
                  <option value="qty">Sort: Qty Sold</option>
                  <option value="gross">Sort: Gross Revenue</option>
                  <option value="net">Sort: Net Revenue</option>
                  <option value="gst">Sort: GST Amount</option>
                  <option value="name">Sort: Name A-Z</option>
                </select>
              </div>
            </div>
            <div className="grid grid-4" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
              {[
                { label: 'Unique Items Sold', value: ITEM_STATS.length.toString(), color: 'var(--accent)' },
                { label: 'Total Qty Sold', value: itemTotalQty.toString(), color: 'var(--status-free)' },
                { label: 'Gross Revenue (Incl. GST)', value: formatAmount(itemTotalGross), color: 'var(--accent)' },
                { label: 'Net Revenue (Ex-GST)', value: formatAmount(itemTotalNet), color: 'var(--status-free)' },
                { label: 'Total GST in Revenue', value: formatAmount(itemTotalGST), color: 'var(--status-billing)' },
              ].map(s => (
                <div key={s.label} className="stat-card" style={{ borderLeft: `3px solid ${s.color}` }}>
                  <div className="stat-value" style={{ fontSize: '1.35rem', color: s.color }}>{s.value}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <Package size={16} style={{ display: 'inline', marginRight: 6 }} />
                  Item-wise Sales Report
                  <span className="badge badge-muted" style={{ marginLeft: 10 }}>{ITEM_STATS.length} items</span>
                </div>
              </div>
              {itemLoading ? (
                <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th style={{ cursor: 'pointer' }} onClick={() => setItemSortBy('name')}>Item Name {itemSortBy === 'name' ? '↑' : ''}</th>
                        <th>Category</th>
                        <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => setItemSortBy('qty')}>
                          Qty Sold {itemSortBy === 'qty' ? '↓' : ''}
                        </th>
                        <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => setItemSortBy('gross')}>
                          Gross Revenue {itemSortBy === 'gross' ? '↓' : ''}
                          <div style={{ fontSize: '0.62rem', color: 'var(--accent)', fontWeight: 400 }}>(Incl. GST)</div>
                        </th>
                        <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => setItemSortBy('gst')}>
                          GST Amount {itemSortBy === 'gst' ? '↓' : ''}
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 400 }}>(extracted)</div>
                        </th>
                        <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => setItemSortBy('net')}>
                          Net Revenue {itemSortBy === 'net' ? '↓' : ''}
                          <div style={{ fontSize: '0.62rem', color: 'var(--status-free)', fontWeight: 400 }}>(Ex-GST)</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ITEM_STATS.map((item, i) => {
                        const cat = categories.find(c => c.id === item.categoryId);
                        return (
                          <tr key={item.id}>
                            <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>#{i + 1}</td>
                            <td style={{ fontWeight: 600 }}>{item.name}</td>
                            <td><span className="badge badge-muted" style={{ fontSize: '0.7rem' }}>{cat?.name || '—'}</span></td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                                <div style={{ width: 50, height: 5, background: 'var(--border)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.min(100, (item.qty / (ITEM_STATS[0]?.qty || 1)) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 'inherit' }} />
                                </div>
                                <span style={{ fontWeight: 700 }}>{item.qty}</span>
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{formatAmount(item.gross)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--status-billing)', fontVariantNumeric: 'tabular-nums' }}>{formatAmount(item.gst)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--status-free)', fontVariantNumeric: 'tabular-nums' }}>{formatAmount(item.net)}</td>
                          </tr>
                        );
                      })}
                      {ITEM_STATS.length === 0 && (
                        <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No sales data for selected filters</td></tr>
                      )}
                      {ITEM_STATS.length > 0 && (
                        <tr style={{ borderTop: '2px solid var(--border-strong)', background: 'var(--bg-elevated)' }}>
                          <td colSpan={3} style={{ fontWeight: 700, fontSize: '0.9rem' }}>TOTALS</td>
                          <td style={{ textAlign: 'right', fontWeight: 800 }}>{itemTotalQty}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent)' }}>{formatAmount(itemTotalGross)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--status-billing)' }}>{formatAmount(itemTotalGST)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--status-free)' }}>{formatAmount(itemTotalNet)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

      </div>
    </>
  );
}
