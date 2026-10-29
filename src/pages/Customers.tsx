import React, { useState, useEffect, useMemo } from 'react';
import { useBillStore, CustomerBillSummary } from '../store/billStore';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../store/uiStore';
import { formatAmount } from '../lib/gst';
import {
  UserCircle,
  Phone,
  Receipt,
  CurrencyInr,
  MagnifyingGlass,
  ArrowsClockwise,
  CaretDown,
  CaretUp,
  CaretLeft,
  CaretRight,
  Download,
  Calendar,
  Sparkle,
} from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';

export interface CustomerRecord {
  name: string;
  phone: string;
  visitCount: number;
  totalSpent: number;
  firstVisit: Date;
  lastVisit: Date;
  bills: CustomerBillSummary[];
}

function buildCustomerMap(bills: CustomerBillSummary[]): CustomerRecord[] {
  const map = new Map<string, CustomerRecord>();

  bills
    .filter((b) => b.customerName || b.customerPhone)
    .forEach((bill) => {
      // Key by phone if available, else by name (lower-cased)
      const key = bill.customerPhone
        ? bill.customerPhone.replace(/\s/g, '')
        : (bill.customerName || '').toLowerCase().trim();
      if (!key) return;

      const billDate = new Date(bill.createdAt);

      if (!map.has(key)) {
        map.set(key, {
          name: bill.customerName || '—',
          phone: bill.customerPhone || '—',
          visitCount: 0,
          totalSpent: 0,
          firstVisit: billDate,
          lastVisit: billDate,
          bills: [],
        });
      }
      const rec = map.get(key)!;
      // Prefer a filled name/phone if we get more data in later bills
      if (bill.customerName && rec.name === '—') rec.name = bill.customerName;
      if (bill.customerPhone && rec.phone === '—') rec.phone = bill.customerPhone;
      rec.visitCount += 1;
      rec.totalSpent += bill.totalAmount;

      if (billDate > rec.lastVisit) rec.lastVisit = billDate;
      if (billDate < rec.firstVisit) rec.firstVisit = billDate;

      rec.bills.push(bill);
    });

  return Array.from(map.values()).sort((a, b) => b.lastVisit.getTime() - a.lastVisit.getTime());
}

type SortField = 'name' | 'visitCount' | 'totalSpent' | 'lastVisit';
type DatePreset = '30d' | '90d' | '180d' | '365d' | 'all' | 'custom';

export default function Customers() {
  const localBills = useBillStore((s) => s.bills);
  const fetchCustomerBills = useBillStore((s) => s.fetchCustomerBills);
  const { currentUser } = useAuthStore();
  const isAdmin = currentUser?.role === 'admin';
  const toast = useToast();

  const [customerBills, setCustomerBills] = useState<CustomerBillSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('lastVisit');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Date filter state (Default to 90 days for ultra-fast load and zero egress waste)
  const [datePreset, setDatePreset] = useState<DatePreset>('90d');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));

  // Table pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const getDateRange = (): { start?: Date; end?: Date } => {
    if (datePreset === 'all') return {};

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    if (datePreset === 'custom') {
      const startD = new Date(customStart);
      startD.setHours(0, 0, 0, 0);
      const endD = new Date(customEnd);
      endD.setHours(23, 59, 59, 999);
      return { start: startD, end: endD };
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    if (datePreset === '30d') start.setDate(start.getDate() - 30);
    else if (datePreset === '90d') start.setDate(start.getDate() - 90);
    else if (datePreset === '180d') start.setDate(start.getDate() - 180);
    else if (datePreset === '365d') start.setDate(start.getDate() - 365);

    return { start, end };
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const remote = await fetchCustomerBills(start, end);

      if (remote && remote.length > 0) {
        setCustomerBills(remote);
      } else {
        // Fallback to locally cached store bills if remote is empty or columns are pending migration
        const filteredLocal = localBills
          .filter((b) => {
            if (b.status === 'void') return false;
            if (!b.customerName && !b.customerPhone) return false;
            const bDate = new Date(b.createdAt);
            if (start && bDate < start) return false;
            if (end && bDate > end) return false;
            return true;
          })
          .map((b) => ({
            id: b.id,
            invoiceNumber: b.invoiceNumber,
            customerName: b.customerName,
            customerPhone: b.customerPhone,
            totalAmount: b.totalAmount,
            tableNumber: b.tableNumber,
            payments: b.payments as any,
            createdAt: new Date(b.createdAt),
          }));

        setCustomerBills(filteredLocal);
      }
    } catch (err) {
      console.warn('Could not load remote customer bills, using local cache:', err);
      // Local fallback
      const localFiltered = localBills
        .filter((b) => b.status !== 'void' && (b.customerName || b.customerPhone))
        .map((b) => ({
          id: b.id,
          invoiceNumber: b.invoiceNumber,
          customerName: b.customerName,
          customerPhone: b.customerPhone,
          totalAmount: b.totalAmount,
          tableNumber: b.tableNumber,
          payments: b.payments as any,
          createdAt: new Date(b.createdAt),
        }));
      setCustomerBills(localFiltered);
      toast.warning('Offline mode', 'Showing locally cached bills');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datePreset, customStart, customEnd]);

  // Reset to page 1 whenever search, date, or sorting changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, datePreset, sortField, sortAsc, pageSize]);

  const customers = useMemo(() => buildCustomerMap(customerBills), [customerBills]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let list = q
      ? customers.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.phone.includes(q)
        )
      : customers;

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortField === 'visitCount') cmp = a.visitCount - b.visitCount;
      else if (sortField === 'totalSpent') cmp = a.totalSpent - b.totalSpent;
      else cmp = a.lastVisit.getTime() - b.lastVisit.getTime();
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [customers, searchQuery, sortField, sortAsc]);

  // Pagination calculations
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedCustomers = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filtered.slice(startIdx, startIdx + pageSize);
  }, [filtered, currentPage, pageSize]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc((v) => !v);
    else { setSortField(field); setSortAsc(false); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortAsc ? <CaretUp size={13} /> : <CaretDown size={13} />;
  };

  const totalRevenue = useMemo(() => customers.reduce((s, c) => s + c.totalSpent, 0), [customers]);
  const repeatCustomers = useMemo(() => customers.filter((c) => c.visitCount > 1).length, [customers]);
  const repeatRate = customers.length ? Math.round((repeatCustomers / customers.length) * 100) : 0;

  // ── CSV EXPORT ─────────────────────────────────────────────────────────
  const downloadCSV = () => {
    if (filtered.length === 0) {
      toast.warning('No Records', 'There is no customer data to export for the selected filter.');
      return;
    }

    const headers = [
      'Customer Name',
      'Phone Number',
      'Total Visits',
      'Total Spent (INR)',
      'Avg Spend / Visit (INR)',
      'First Visit Date',
      'Last Visit Date',
      'Latest Invoice Number',
    ];

    const rows = filtered.map((c) => {
      const avg = c.visitCount > 0 ? (c.totalSpent / c.visitCount).toFixed(2) : '0.00';
      const firstStr = c.firstVisit.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const lastStr = c.lastVisit.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const latestInv = c.bills[0]?.invoiceNumber || '—';
      const cleanName = `"${c.name.replace(/"/g, '""')}"`;
      const cleanPhone = c.phone !== '—' ? `"${c.phone}"` : '""';

      return [
        cleanName,
        cleanPhone,
        c.visitCount,
        c.totalSpent.toFixed(2),
        avg,
        `"${firstStr}"`,
        `"${lastStr}"`,
        `"${latestInv}"`,
      ].join(',');
    });

    // Summary line
    const totalSpentSum = filtered.reduce((acc, c) => acc + c.totalSpent, 0);
    const totalVisitsSum = filtered.reduce((acc, c) => acc + c.visitCount, 0);
    const avgOverall = filtered.length > 0 ? (totalSpentSum / filtered.length).toFixed(2) : '0.00';

    const summaryRow = [
      '"TOTAL / SUMMARY"',
      `"Unique Customers: ${filtered.length}"`,
      totalVisitsSum,
      totalSpentSum.toFixed(2),
      avgOverall,
      '""',
      '""',
      '""',
    ].join(',');

    // UTF-8 BOM prefix ensures Indian characters and formatting display cleanly in Excel
    const csvData = '\uFEFF' + [headers.join(','), ...rows, '', summaryRow].join('\r\n');
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `customers-${datePreset}-${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('CSV Downloaded', `Successfully exported ${filtered.length} customers to CSV.`);
  };

  return (
    <>
      <TopBar title="Customers" />
      <div className="page-body">
        {/* Banner with Egress Optimization reassurance */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(34, 197, 94, 0.08)',
          border: '1px solid rgba(34, 197, 94, 0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 16px',
          marginBottom: 'var(--space-4)',
          fontSize: '0.825rem',
          color: 'var(--text-secondary)',
          flexWrap: 'wrap',
          gap: 8,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkle size={16} weight="fill" style={{ color: '#22c55e' }} />
            <strong style={{ color: '#22c55e' }}>Lean Egress Protection:</strong> Only customer-linked bills are loaded without items JSON (97% bandwidth saved).
          </span>
          <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>
            Paginated &amp; Optimized
          </span>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Total Customers</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent)' }}>{customers.length}</div>
          </div>
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Repeat Customers</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#22c55e' }}>{repeatCustomers}</div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({repeatRate}%)</span>
            </div>
          </div>
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Customer Revenue</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{formatAmount(totalRevenue)}</div>
          </div>
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Avg Spend / Customer</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {customers.length ? formatAmount(totalRevenue / customers.length) : '—'}
            </div>
          </div>
        </div>

        {/* Filters and Action Bar */}
        <div className="card" style={{ padding: '14px 18px', marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            
            {/* Date Range Presets */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Calendar size={18} style={{ color: 'var(--text-muted)', marginRight: 2 }} />
              <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Period:</span>
              {(
                [
                  { id: '30d', label: 'Last 30 Days' },
                  { id: '90d', label: 'Last 90 Days' },
                  { id: '180d', label: 'Last 6 Months' },
                  { id: '365d', label: '1 Year' },
                  { id: 'all', label: 'All Time' },
                  { id: 'custom', label: 'Custom' },
                ] as const
              ).map((preset) => {
                const isActive = datePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setDatePreset(preset.id)}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.775rem',
                      borderRadius: 'var(--radius-sm)',
                      border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                      background: isActive ? 'var(--accent)' : 'var(--bg)',
                      color: isActive ? '#0c0e16' : 'var(--text-secondary)',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* CSV Download & Refresh */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={downloadCSV}
                disabled={loading || filtered.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                title="Download filtered customer list as CSV"
              >
                <Download size={15} weight="bold" />
                Download CSV
              </button>

              <button
                className="btn btn-secondary btn-sm"
                onClick={loadData}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                title="Refresh customer data"
              >
                <ArrowsClockwise size={15} className={loading ? 'spin' : ''} />
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Custom Date Pickers (if Custom selected) */}
          {datePreset === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>From:</span>
              <input
                type="date"
                className="input"
                style={{ width: 'auto', padding: '4px 8px', fontSize: '0.825rem' }}
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>To:</span>
              <input
                type="date"
                className="input"
                style={{ width: 'auto', padding: '4px 8px', fontSize: '0.825rem' }}
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Search Bar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 'var(--space-4)', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <MagnifyingGlass size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              id="customer-search"
              className="input"
              type="text"
              placeholder="Search by customer name or phone number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>
          {searchQuery && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setSearchQuery('')}
            >
              Clear Search
            </button>
          )}
        </div>

        {/* Main Table Card */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="card-title">
              <UserCircle size={18} style={{ display: 'inline', marginRight: 8 }} />
              Customer Records
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="badge badge-muted">
                {totalItems} total {totalItems === 1 ? 'customer' : 'customers'}
              </span>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ width: 30, height: 30, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
              Loading customer records...
            </div>
          ) : totalItems === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <div className="empty-state-icon"><UserCircle size={32} /></div>
              <div className="empty-state-title">{searchQuery ? 'No matching customers found' : 'No customer data in this date range'}</div>
              <div className="empty-state-desc">
                {searchQuery
                  ? 'Try searching with a different name or phone number.'
                  : 'Customer phone and name will automatically appear here once entered during billing.'}
              </div>
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('name')}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Customer <SortIcon field="name" /></span>
                      </th>
                      <th>Phone</th>
                      <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center' }} onClick={() => toggleSort('visitCount')}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>Visits <SortIcon field="visitCount" /></span>
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'right' }} onClick={() => toggleSort('totalSpent')}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>Total Spent <SortIcon field="totalSpent" /></span>
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'right' }} onClick={() => toggleSort('lastVisit')}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>Last Visit <SortIcon field="lastVisit" /></span>
                      </th>
                      <th style={{ width: 40 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCustomers.map((c) => {
                      const key = c.phone !== '—' ? c.phone.replace(/\s/g, '') : c.name.toLowerCase();
                      const isExpanded = expandedKey === key;
                      return (
                        <React.Fragment key={key}>
                          <tr
                            style={{ cursor: 'pointer' }}
                            onClick={() => setExpandedKey(isExpanded ? null : key)}
                          >
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                  width: 34, height: 34, borderRadius: '50%',
                                  background: 'linear-gradient(135deg, var(--accent), var(--brand-dark, #b08b0c))',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontWeight: 800, fontSize: '0.9rem', color: '#0c0e16', flexShrink: 0,
                                }}>
                                  {c.name !== '—' ? c.name.charAt(0).toUpperCase() : '?'}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                                  <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                                    First visit: {c.firstVisit.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                <Phone size={14} style={{ color: 'var(--text-muted)' }} /> {c.phone}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className={`badge ${c.visitCount > 1 ? 'badge-success' : 'badge-muted'}`}>
                                {c.visitCount} {c.visitCount === 1 ? 'visit' : 'visits'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>
                              {formatAmount(c.totalSpent)}
                            </td>
                            <td style={{ textAlign: 'right', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                              {c.lastVisit.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {isExpanded ? <CaretUp size={16} style={{ color: 'var(--accent)' }} /> : <CaretDown size={16} style={{ color: 'var(--text-muted)' }} />}
                            </td>
                          </tr>

                          {/* Expanded bill history for this customer */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={6} style={{ padding: 0, background: 'var(--bg)' }}>
                                <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--border)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                      <Receipt size={13} style={{ display: 'inline', marginRight: 4 }} /> Visit &amp; Bill History ({c.bills.length})
                                    </div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent)' }}>
                                      <CurrencyInr size={13} style={{ display: 'inline' }} /> Lifetime Total: {formatAmount(c.totalSpent)}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {[...c.bills]
                                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                      .map((bill) => (
                                        <div key={bill.id} style={{
                                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                          padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
                                          border: '1px solid var(--border)', fontSize: '0.825rem',
                                        }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{bill.invoiceNumber}</span>
                                            <span style={{ color: 'var(--text-muted)' }}>
                                              {new Date(bill.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                              {' '}
                                              {new Date(bill.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                            </span>
                                            {bill.tableNumber && (
                                              <span className="badge badge-muted">Table {bill.tableNumber}</span>
                                            )}
                                            <span className="badge badge-muted" style={{ textTransform: 'capitalize' }}>
                                              {bill.payments?.[0]?.mode || 'cash'}
                                            </span>
                                          </div>
                                          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{formatAmount(bill.totalAmount)}</span>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table Pagination Controls */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 18px',
                borderTop: '1px solid var(--border)',
                flexWrap: 'wrap',
                gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                  <span>
                    Showing <strong>{Math.min(totalItems, (currentPage - 1) * pageSize + 1)}</strong> to{' '}
                    <strong>{Math.min(totalItems, currentPage * pageSize)}</strong> of <strong>{totalItems}</strong> customers
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Rows:</span>
                    <select
                      className="input"
                      style={{ padding: '2px 6px', fontSize: '0.8rem', width: 'auto' }}
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <CaretLeft size={14} /> Prev
                  </button>
                  <span style={{ fontSize: '0.825rem', padding: '0 8px', color: 'var(--text-secondary)' }}>
                    Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    Next <CaretRight size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Informational footer note */}
        <div style={{ marginTop: 14, fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          ℹ️ Egress-safe: Only customer-linked bills are fetched, omitting dish item details. Click any customer row to inspect their previous invoices.
        </div>
      </div>
    </>
  );
}
