import React, { useState } from 'react';
import { formatAmount, GST_STATE_CODES } from '../lib/gst';
import { FilePdf, Download, FileText, CalendarBlank } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { useBillStore } from '../store/billStore';
import { useAccountingStore } from '../store/accountingStore';
import { useSettingsStore } from '../store/settingsStore';
import { Bill } from '../types';
import jsPDF from 'jspdf';

export default function GstFiling() {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // Default to start of current month
    return d.toISOString().split('T')[0];
  });
  
  const [toDate, setToDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const { fetchBillsByDateRange, bills: localBills } = useBillStore();
  const { bankAccounts, ledgerTransactions } = useAccountingStore();
  const { settings } = useSettingsStore();

  const getBillsForPeriod = async (): Promise<{ start: Date; end: Date; bills: Bill[] }> => {
    const start = new Date(fromDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    
    let gstrBills: Bill[] = [];
    try { 
      gstrBills = await fetchBillsByDateRange(start, end); 
    } catch { 
      gstrBills = localBills.filter(b => {
        const d = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return d >= start && d <= end;
      }); 
    }
    return { start, end, bills: gstrBills };
  };

  const downloadCSV = (lines: string[], name: string) => { 
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' }); 
    const url = URL.createObjectURL(blob); 
    const a = document.createElement('a'); 
    a.href = url; 
    a.download = `${name}-${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.csv`; 
    a.click(); 
    URL.revokeObjectURL(url); 
  };



  // ── Daily GST Sales Register (CSV) ───────────────────────────────────────────
  const handleExportDailyRegisterCSV = async () => {
    const { start, end, bills: rawBills } = await getBillsForPeriod();
    const activeBills = rawBills.filter(b => b.status !== 'void' && b.isGstBill !== false);

    const getInvNum = (inv: string) => parseInt((inv || '').split('/').pop() || '0', 10);
    
    // Sort chronologically by createdAt to guarantee daily boundaries
    const sortedBills = [...activeBills].sort((a, b) => {
      const da = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      const db = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
      return da.getTime() - db.getTime();
    });

    const dailyMap = new Map<string, Map<number, {
      minInv: number; maxInv: number; minInvStr: string; maxInvStr: string;
      taxable: number; cgst: number; sgst: number; total: number;
    }>>();

    sortedBills.forEach(b => {
      const d = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
      const dateStr = d.toLocaleDateString('en-IN');
      const invNum = getInvNum(b.invoiceNumber);

      if (!dailyMap.has(dateStr)) dailyMap.set(dateStr, new Map());
      const rateMap = dailyMap.get(dateStr)!;

      b.items?.forEach(item => {
        if (item.status === 'void') return;
        const rate = item.gstRate || 0;
        const taxable = item.totalPrice / (1 + rate / 100);
        const tax = item.totalPrice - taxable;

        if (!rateMap.has(rate)) {
          rateMap.set(rate, {
            minInv: invNum, maxInv: invNum, minInvStr: b.invoiceNumber, maxInvStr: b.invoiceNumber,
            taxable: 0, cgst: 0, sgst: 0, total: 0
          });
        }
        const group = rateMap.get(rate)!;
        if (invNum < group.minInv) { group.minInv = invNum; group.minInvStr = b.invoiceNumber; }
        if (invNum > group.maxInv) { group.maxInv = invNum; group.maxInvStr = b.invoiceNumber; }
        group.taxable += taxable;
        group.cgst += tax / 2;
        group.sgst += tax / 2;
        group.total += item.totalPrice;
      });
    });

    const header = 'Date,From Serial No.,To Serial No.,Tax Rate,Net Sales (Taxable),CGST,SGST,Gross Sales (Total)';
    const rows: string[] = [];

    Array.from(dailyMap.entries()).forEach(([dateStr, rateMap]) => {
      Array.from(rateMap.entries()).sort((a,b) => a[0]-b[0]).forEach(([rate, g]) => {
        rows.push(`${dateStr},${g.minInvStr},${g.maxInvStr},${rate}%,${g.taxable.toFixed(2)},${g.cgst.toFixed(2)},${g.sgst.toFixed(2)},${g.total.toFixed(2)}`);
      });
    });

    const csvContent = [
      `DAILY GST SALES REGISTER — ${settings.restaurantName}`,
      `GSTIN: ${settings.gstin || 'N/A'}`,
      `Period: ${start.toLocaleDateString('en-IN')} to ${end.toLocaleDateString('en-IN')}`,
      '',
      header,
      ...rows
    ];

    downloadCSV(csvContent, 'Daily-GST-Register');
  };

  // ── jsPDF Auditor Report ─────────────────────────────────────────────────────
  const handleDownloadAuditorPDF = async () => {
    const { start, end, bills: auditBills } = await getBillsForPeriod();
    const activeBills = auditBills.filter(b => b.status !== 'void');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();
    let y = 18;
    const lm = 14; 
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
      // Calculate GST dynamically from items to support legacy bills
      b.items?.forEach(item => {
        if (item.status === 'void') return;
        const rate = item.gstRate || 0;
        const taxable = item.totalPrice / (1 + rate / 100);
        const tax = item.totalPrice - taxable;
        
        if (!gstMap.has(rate)) {
          gstMap.set(rate, { taxable: 0, cgst: 0, sgst: 0, igst: 0 });
        }
        
        const group = gstMap.get(rate)!;
        group.taxable += taxable;
        group.cgst += tax / 2;
        group.sgst += tax / 2;
        // Assuming intra-state for general auditor PDF unless specifically IGST
        // (If IGST is needed, we would cross-check settings.businessState)
      });
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

  return (
    <>
      <TopBar title="GST Filing & Auditing" />
      <div className="page-container" style={{ maxWidth: 800, margin: '0 auto' }}>
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ marginBottom: 24, color: 'var(--accent)' }}>
            <FileText size={56} weight="duotone" />
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 12 }}>Export Auditor Reports</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 40, maxWidth: 500, margin: '0 auto 40px', lineHeight: 1.6 }}>
            Select a custom date range to export the GSTR-1 payload for your auditor or generate a comprehensive PDF summary of sales, taxes, and ledgers.
          </p>

          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            gap: 24, 
            marginBottom: 40,
            background: 'var(--bg-secondary)',
            padding: '24px 32px',
            borderRadius: 12,
            width: 'fit-content',
            margin: '0 auto 40px',
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>From Date</label>
              <div className="input-with-icon" style={{ background: 'var(--bg-primary)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarBlank size={18} color="var(--text-muted)" />
                <input 
                  type="date" 
                  value={fromDate} 
                  onChange={(e) => setFromDate(e.target.value)}
                  style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.9rem' }}
                />
              </div>
            </div>
            <div style={{ width: 1, height: 48, background: 'var(--border)' }}></div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>To Date</label>
              <div className="input-with-icon" style={{ background: 'var(--bg-primary)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarBlank size={18} color="var(--text-muted)" />
                <input 
                  type="date" 
                  value={toDate} 
                  onChange={(e) => setToDate(e.target.value)}
                  style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.9rem' }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button 
              className="btn btn-primary" 
              onClick={handleExportDailyRegisterCSV}
              style={{ padding: '12px 24px', fontSize: '1rem', minWidth: 220, height: 48 }}
            >
              <FileText size={20} />
              Daily Sales Register (CSV)
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={handleDownloadAuditorPDF}
              style={{ padding: '12px 24px', fontSize: '1rem', minWidth: 220, color: 'var(--accent)', height: 48, borderColor: 'var(--accent)' }}
            >
              <FilePdf size={20} />
              Auditor Summary (PDF)
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
