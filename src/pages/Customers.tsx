import React, { useState, useEffect, useMemo } from 'react';
import { useBillStore } from '../store/billStore';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../store/uiStore';
import { formatAmount } from '../lib/gst';
import { Bill } from '../types';
import {
  UserCircle,
  Phone,
  Receipt,
  CurrencyInr,
  MagnifyingGlass,
  ArrowsClockwise,
  CaretDown,
  CaretUp,
} from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';

interface CustomerRecord {
  name: string;
  phone: string;
  visitCount: number;
  totalSpent: number;
  lastVisit: Date;
  bills: Bill[];
}

function buildCustomerMap(bills: Bill[]): CustomerRecord[] {
  const map = new Map<string, CustomerRecord>();

  bills
    .filter((b) => b.status !== 'void' && (b.customerName || b.customerPhone))
    .forEach((bill) => {
      // Key by phone if available, else by name (lower-cased)
      const key = bill.customerPhone
        ? bill.customerPhone.replace(/\s/g, '')
        : (bill.customerName || '').toLowerCase().trim();
      if (!key) return;

      if (!map.has(key)) {
        map.set(key, {
          name: bill.customerName || '—',
          phone: bill.customerPhone || '—',
          visitCount: 0,
          totalSpent: 0,
          lastVisit: new Date(bill.createdAt),
          bills: [],
        });
      }
      const rec = map.get(key)!;
      // Prefer a filled name/phone if we get more data in later bills
      if (bill.customerName && rec.name === '—') rec.name = bill.customerName;
      if (bill.customerPhone && rec.phone === '—') rec.phone = bill.customerPhone;
      rec.visitCount += 1;
      rec.totalSpent += bill.totalAmount;
      const d = new Date(bill.createdAt);
      if (d > rec.lastVisit) rec.lastVisit = d;
      rec.bills.push(bill);
    });

  return Array.from(map.values()).sort((a, b) => b.lastVisit.getTime() - a.lastVisit.getTime());
}

type SortField = 'name' | 'visitCount' | 'totalSpent' | 'lastVisit';

export default function Customers() {
  const localBills = useBillStore((s) => s.bills);
  const fetchBillsByDateRange = useBillStore((s) => s.fetchBillsByDateRange);
  const { currentUser } = useAuthStore();
  const isAdmin = currentUser?.role === 'admin';
  const toast = useToast();

  const [allBills, setAllBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('lastVisit');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      // Fetch last 12 months for a full customer picture
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const start = new Date();
      start.setFullYear(start.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);

      let page = 1;
      let collected: Bill[] = [];
      while (true) {
        const { bills, total } = await fetchBillsByDateRange(start, end, page, 1000);
        collected = [...collected, ...bills];
        if (collected.length >= total || bills.length < 1000) break;
        page++;
      }
      setAllBills(collected);
    } catch {
      // Fallback to local bills
      setAllBills(localBills);
      toast.warning('Offline mode', 'Showing locally cached bills only');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const customers = useMemo(() => buildCustomerMap(allBills), [allBills]);

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

  return (
    <>
      <TopBar title="Customers" />
      <div className="page-body">
        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Total Customers</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent)' }}>{customers.length}</div>
          </div>
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Repeat Customers</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--status-free)' }}>{repeatCustomers}</div>
          </div>
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Total Revenue</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{formatAmount(totalRevenue)}</div>
          </div>
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Avg Spend / Customer</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{customers.length ? formatAmount(totalRevenue / customers.length) : '—'}</div>
          </div>
        </div>

        {/* Search + Refresh */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <MagnifyingGlass size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              id="customer-search"
              className="input"
              type="text"
              placeholder="Search by name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={fetchAll}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowsClockwise size={15} className={loading ? 'spin' : ''} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {/* Table */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="card-title">
              <UserCircle size={18} style={{ display: 'inline', marginRight: 8 }} />
              Customer Records
            </div>
            <span className="badge badge-muted">{filtered.length} records</span>
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
              Loading customers...
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <div className="empty-state-icon"><UserCircle size={32} /></div>
              <div className="empty-state-title">{searchQuery ? 'No results found' : 'No customer data yet'}</div>
              <div className="empty-state-desc">{searchQuery ? 'Try a different name or phone number' : 'Customer name/phone will appear here once entered during billing'}</div>
            </div>
          ) : (
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
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
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
                              <span style={{ fontWeight: 600 }}>{c.name}</span>
                            </div>
                          </td>
                          <td>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                              <Phone size={14} /> {c.phone}
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
                          <td style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {c.lastVisit.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td>
                            {isExpanded ? <CaretUp size={16} style={{ color: 'var(--text-muted)' }} /> : <CaretDown size={16} style={{ color: 'var(--text-muted)' }} />}
                          </td>
                        </tr>

                        {/* Expanded bill history for this customer */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} style={{ padding: 0, background: 'var(--bg)' }}>
                              <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                                  <Receipt size={13} style={{ display: 'inline', marginRight: 4 }} /> Bill History
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
                                          <span className="badge badge-muted" style={{ textTransform: 'capitalize' }}>{bill.payments?.[0]?.mode || 'cash'}</span>
                                        </div>
                                        <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{formatAmount(bill.totalAmount)}</span>
                                      </div>
                                    ))}
                                </div>
                                <div style={{ marginTop: 10, fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent)', textAlign: 'right' }}>
                                  <CurrencyInr size={13} style={{ display: 'inline' }} /> Lifetime: {formatAmount(c.totalSpent)}
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
          )}
        </div>

        {/* Note about data source */}
        <div style={{ marginTop: 12, fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          ℹ️ Only bills where customer name or phone was entered during billing are shown here.
        </div>
      </div>
    </>
  );
}
