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

  // ── GSTR-1 CSV Export (Table 7 & Table 13 for B2C Intra-State) ────────────────
  const handleExportGSTR1CSV = async () => {
    const { start, end, bills: gstrBills } = await getBillsForPeriod();

    // Resolve POS State Code robustly
    const bState = settings.businessState || 'Tamil Nadu';
    const stateEntries = Object.entries(GST_STATE_CODES);
    const stateCodeMatch = stateEntries.find(([code, name]) => 
      name.toLowerCase() === bState.toLowerCase() || 
      name.toLowerCase().includes(bState.toLowerCase()) || 
      bState.toLowerCase().includes(name.toLowerCase())
    );
    const posString = stateCodeMatch ? `${stateCodeMatch[0]}-${stateCodeMatch[1]}` : `33-${bState}`;

    // --- TABLE 7: B2C (Others) ---
    const activeGSTBills = gstrBills.filter(b => b.status !== 'void' && b.isGstBill !== false);
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

    // --- TABLE 13: Documents Issued (Daily Segregation) ---
    const billsByDate = new Map<string, Bill[]>();
    gstrBills.forEach(b => {
      const d = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
      // Format to YYYY-MM-DD for stable chronological sorting
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      if (!billsByDate.has(dateStr)) {
        billsByDate.set(dateStr, []);
      }
      billsByDate.get(dateStr)!.push(b);
    });

    const t13Header = 'Type of Document,From Serial No.,To Serial No.,Total Count,Cancelled Count,Net Issued';
    const sortedDates = Array.from(billsByDate.keys()).sort();
    
    const t13Rows = sortedDates.map(dateStr => {
      const dailyBills = billsByDate.get(dateStr)!;
      const allInvoiceNumbers = dailyBills.map(b => b.invoiceNumber).sort();
      const minInvoice = allInvoiceNumbers[0];
      const maxInvoice = allInvoiceNumbers[allInvoiceNumbers.length - 1];
      const totalCount = dailyBills.length;
      const cancelledCount = dailyBills.filter(b => b.status === 'void').length;
      const netIssued = totalCount - cancelledCount;
      return `B2C Invoices,${minInvoice},${maxInvoice},${totalCount},${cancelledCount},${netIssued}`;
    });

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
      ...t13Rows
    ];

    downloadCSV(csvContent, `GSTR1`);
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
      if (!b.isGstBill) return;
      b.gstBreakdown?.forEach(g => {
        if (!gstMap.has(g.rate)) gstMap.set(g.rate, { taxable: 0, cgst: 0, sgst: 0, igst: 0 });
        const e = gstMap.get(g.rate)!;
        e.taxable += g.taxableAmount; e.cgst += g.cgst; e.sgst += g.sgst; e.igst += g.igst;
      });
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
              onClick={handleExportGSTR1CSV}
              style={{ padding: '12px 24px', fontSize: '1rem', minWidth: 220, height: 48 }}
            >
              <Download size={20} />
              GSTR-1 Payload (CSV)
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
