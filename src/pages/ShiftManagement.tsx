import React, { useState, useMemo } from 'react';
import { useShiftStore } from '../store/shiftStore';
import { useAuthStore } from '../store/authStore';
import { useBillStore } from '../store/billStore';
import { useToast } from '../store/uiStore';
import { formatAmount } from '../lib/gst';
import { Shift, Bill } from '../types';
import { supabase } from '../lib/supabase';
import {
  Timer,
  CheckCircle,
  CurrencyInr,
  Receipt,
  Users,
  Printer,
  Lock,
  LockOpen,
  Clock,
  Trash,
  ArrowsClockwise,
  UserCheck,
  Eye,
  XCircle,
  ShieldCheck,
  Calculator,
} from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { useReactToPrint } from 'react-to-print';

export default function ShiftManagement() {
  const { activeShifts, shifts, openShift, closeShift, getActiveShiftForStaff, recalculateShiftTotals } = useShiftStore();
  const { currentUser, allUsers } = useAuthStore();
  const { bills, fetchBillsForShift } = useBillStore();
  const toast = useToast();

  const isAdmin = currentUser?.role === 'admin';

  const [openingBalance, setOpeningBalance] = useState('');
  const [selectedStaffIdForOpen, setSelectedStaffIdForOpen] = useState<string>('');
  const [closeNotes, setCloseNotes] = useState('');
  const [actualCash, setActualCash] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [detailModalShift, setDetailModalShift] = useState<Shift | null>(null);
  const [shiftTab, setShiftTab] = useState<'paid' | 'voided' | 'revised'>('paid');
  const [loadingShiftBills, setLoadingShiftBills] = useState(false);
  const [loadingModalBills, setLoadingModalBills] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const printRef = React.useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ content: () => printRef.current });

  // Current logged in user's active shift
  const myActiveShift = useMemo(() => {
    return currentUser ? getActiveShiftForStaff(currentUser.id) : undefined;
  }, [currentUser, activeShifts, getActiveShiftForStaff]);

  // Selected active shift to display in dashboard (Admin only)
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);

  // Determine which shift to view:
  // If ADMIN: can view selectedShiftId, or myActiveShift, or first active shift.
  // If EMPLOYEE: can ONLY EVER view myActiveShift! (Never other cashiers' shifts)
  const currentShift = useMemo(() => {
    if (isAdmin) {
      if (selectedShiftId) {
        const found = activeShifts.find((s) => s.id === selectedShiftId);
        if (found) return found;
      }
      return myActiveShift || activeShifts[0] || null;
    }
    // Employee strictly restricted to their own shift only
    return myActiveShift || null;
  }, [selectedShiftId, activeShifts, myActiveShift, isAdmin]);

  const lastSyncedShiftIdRef = React.useRef<string | null>(null);
  const isSyncingRef = React.useRef(false);

  // Sync bills from cloud for the current shift so cross-device bills (tab to laptop) appear immediately
  const syncShiftBills = React.useCallback(async (showToast = false) => {
    if (!currentShift || isSyncingRef.current) return;
    isSyncingRef.current = true;
    setLoadingShiftBills(true);
    try {
      const fetched = await fetchBillsForShift(
        currentShift.id,
        currentShift.staffId,
        currentShift.openedAt,
        currentShift.closedAt,
        currentShift.staffName
      );
      // Automatically recalculate authoritative totals excluding voided/revised bills
      await recalculateShiftTotals(currentShift.id, fetched);
      if (showToast) {
        toast.success('Shift Synced', `Loaded ${fetched.length} bills for ${currentShift.staffName}`);
      }
    } catch (err) {
      console.error('Error syncing shift bills:', err);
    } finally {
      setLoadingShiftBills(false);
      isSyncingRef.current = false;
    }
  }, [currentShift?.id, currentShift?.staffId, currentShift?.openedAt, currentShift?.closedAt, currentShift?.staffName, fetchBillsForShift, recalculateShiftTotals, toast]);

  // Only pull data from cloud ONCE when currentShift ID changes (initial load or tab switch)
  React.useEffect(() => {
    if (currentShift?.id && currentShift.id !== lastSyncedShiftIdRef.current) {
      lastSyncedShiftIdRef.current = currentShift.id;
      syncShiftBills(false);
    }
  }, [currentShift?.id]);

  // Load bills for past closed shift in detail modal
  React.useEffect(() => {
    if (detailModalShift) {
      setLoadingModalBills(true);
      fetchBillsForShift(
        detailModalShift.id,
        detailModalShift.staffId,
        detailModalShift.openedAt,
        detailModalShift.closedAt,
        detailModalShift.staffName
      ).finally(() => setLoadingModalBills(false));
    }
  }, [detailModalShift?.id, fetchBillsForShift]);

  // Helper to check if a bill was created in this shift
  const isBillInShift = (b: Bill, s: Shift) => {
    if (b.shiftId && b.shiftId === s.id) return true;
    if (b.shiftId && b.shiftId !== s.id) return false;
    const bTime = new Date(b.createdAt).getTime();
    const sOpen = new Date(s.openedAt).getTime();
    const sClose = s.closedAt ? new Date(s.closedAt).getTime() : Infinity;
    if (bTime < sOpen || bTime > sClose) return false;

    const isSameStaff =
      (b.staffId && s.staffId && String(b.staffId).trim() === String(s.staffId).trim()) ||
      (b.staffName && s.staffName && b.staffName.toLowerCase().trim() === s.staffName.toLowerCase().trim());
    if (isSameStaff) return true;

    // If bill does not have shiftId explicitly attached:
    // Check if another shift existed that matches the bill's staff exactly
    const otherMatchingShift = shifts.find(
      (os) =>
        os.id !== s.id &&
        ((b.staffId && os.staffId && String(b.staffId).trim() === String(os.staffId).trim()) ||
         (b.staffName && os.staffName && b.staffName.toLowerCase().trim() === os.staffName.toLowerCase().trim())) &&
        bTime >= new Date(os.openedAt).getTime() &&
        bTime <= (os.closedAt ? new Date(os.closedAt).getTime() : Infinity)
    );
    // If no other shift explicitly claims this bill (e.g. sub-counter or waiter billed while this shift was open), it belongs to this shift
    return !otherMatchingShift;
  };

  // 1. Paid bills for selected active shift
  const shiftBills = useMemo(() => {
    if (!currentShift) return [];
    return bills.filter((b) => isBillInShift(b, currentShift) && (b.status === 'paid' || !b.status));
  }, [bills, currentShift]);

  // 2. Voided / Deleted bills during selected active shift
  const shiftVoidedBills = useMemo(() => {
    if (!currentShift) return [];
    return bills.filter((b) => {
      if (b.status !== 'void') return false;
      if (b.voidShiftId && b.voidShiftId === currentShift.id) return true;
      if (b.shiftId && b.shiftId === currentShift.id) return true;
      const vTime = b.voidedAt ? new Date(b.voidedAt).getTime() : new Date(b.createdAt).getTime();
      const sOpen = new Date(currentShift.openedAt).getTime();
      const sClose = currentShift.closedAt ? new Date(currentShift.closedAt).getTime() : Infinity;
      const isSameStaff =
        (b.voidedBy && b.voidedBy.toLowerCase().trim() === currentShift.staffName?.toLowerCase().trim()) ||
        b.staffName?.toLowerCase().trim() === currentShift.staffName?.toLowerCase().trim();
      return isSameStaff && vTime >= sOpen && vTime <= sClose;
    });
  }, [bills, currentShift]);

  // 3. Revised bills during selected active shift
  const shiftRevisedBills = useMemo(() => {
    if (!currentShift) return [];
    return bills.filter((b) => {
      if (b.status !== 'revised') return false;
      if (b.revisedShiftId && b.revisedShiftId === currentShift.id) return true;
      if (b.shiftId && b.shiftId === currentShift.id) return true;
      const rTime = b.revisedAt ? new Date(b.revisedAt).getTime() : new Date(b.createdAt).getTime();
      const sOpen = new Date(currentShift.openedAt).getTime();
      const sClose = currentShift.closedAt ? new Date(currentShift.closedAt).getTime() : Infinity;
      const isSameStaff =
        (b.revisedBy && b.revisedBy.toLowerCase().trim() === currentShift.staffName?.toLowerCase().trim()) ||
        b.staffName?.toLowerCase().trim() === currentShift.staffName?.toLowerCase().trim();
      return isSameStaff && rTime >= sOpen && rTime <= sClose;
    });
  }, [bills, currentShift]);

  // Metrics calculation
  const computedCash = shiftBills.reduce(
    (s, b) => s + b.payments.filter((p) => p.mode === 'cash').reduce((a, p) => a + p.amount, 0),
    0
  );
  const computedUPI = shiftBills.reduce(
    (s, b) => s + b.payments.filter((p) => p.mode === 'upi').reduce((a, p) => a + p.amount, 0),
    0
  );
  const computedCard = shiftBills.reduce(
    (s, b) => s + b.payments.filter((p) => p.mode === 'card').reduce((a, p) => a + p.amount, 0),
    0
  );
  const computedRevenue = shiftBills.reduce((s, b) => s + b.totalAmount, 0);
  const computedCovers = shiftBills.reduce((s, b) => s + (b.guestCount || 0), 0);

  // Authoritative metrics: when bills have loaded or voided/revised bills exist, computed metrics must be used!
  // Fallback to shift DB totals only while initial network fetch is actively pending
  const hasLoadedBills =
    !loadingShiftBills ||
    shiftBills.length > 0 ||
    shiftVoidedBills.length > 0 ||
    shiftRevisedBills.length > 0;

  const shiftCash = hasLoadedBills ? computedCash : (currentShift?.totalCash || 0);
  const shiftUPI = hasLoadedBills ? computedUPI : (currentShift?.totalUPI || 0);
  const shiftCard = hasLoadedBills ? computedCard : (currentShift?.totalCard || 0);
  const shiftRevenue = hasLoadedBills ? computedRevenue : (currentShift?.totalRevenue || 0);
  const shiftCovers = hasLoadedBills ? computedCovers : (currentShift?.totalCovers || 0);
  const shiftOrdersCount = hasLoadedBills ? shiftBills.length : (currentShift?.totalOrders || 0);

  const getShiftLiveRevenue = (s: Shift) => {
    const shiftPaid = bills.filter((b) => isBillInShift(b, s) && (b.status === 'paid' || !b.status));
    const hasBillsInStore = bills.some((b) => isBillInShift(b, s));
    if (hasBillsInStore) {
      return shiftPaid.reduce((sum, b) => sum + b.totalAmount, 0);
    }
    return s.totalRevenue || 0;
  };

  const shiftVoidedTotal = shiftVoidedBills.reduce((s, b) => s + b.totalAmount, 0);
  const shiftRevisedTotal = shiftRevisedBills.reduce((s, b) => s + b.totalAmount, 0);
  const closingBalance = (currentShift?.openingBalance || 0) + shiftCash;

  const formatDuration = (start: Date, end?: Date) => {
    const diff = ((end || new Date()).getTime() - new Date(start).getTime()) / 1000;
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const handleOpenShift = async () => {
    if (!currentUser) return;
    const targetStaff =
      isAdmin && selectedStaffIdForOpen
        ? allUsers.find((u) => u.id === selectedStaffIdForOpen) || currentUser
        : currentUser;

    const balance = parseFloat(openingBalance) || 0;
    const newShift = await openShift(targetStaff.name, targetStaff.id, balance);
    if (isAdmin) {
      setSelectedShiftId(newShift.id);
    }
    setOpeningBalance('');
    setSelectedStaffIdForOpen('');
    setShowOpenModal(false);
    toast.success('Shift Opened', `${targetStaff.name}'s shift started with ₹${balance} opening balance`);
  };

  const handleCloseShift = async () => {
    const targetShift = isAdmin ? currentShift : myActiveShift;
    if (!targetShift) return;
    const actualClosingBalance = parseFloat(actualCash);
    if (isNaN(actualClosingBalance)) {
      toast.error('Required', 'Please enter the actual physical cash in the till');
      return;
    }

    // 0. Flush any offline pending bills to Supabase first before closing
    try {
      await useBillStore.getState().syncPendingBills();
    } catch {
      // ignore network errors
    }

    // CRITICAL FIX: Always fetch fresh bills from server before closing
    // to avoid showing 0s in shift history on multi-device setups
    let freshBills: Bill[] = [];
    try {
      freshBills = await fetchBillsForShift(
        targetShift.id,
        targetShift.staffId,
        targetShift.openedAt,
        targetShift.closedAt,
        targetShift.staffName
      );
    } catch (err) {
      console.error('Error fetching bills before close:', err);
      // Fall back to local bills if fetch fails
      freshBills = bills.filter(
        (b) => isBillInShift(b, targetShift) && (b.status === 'paid' || !b.status)
      );
    }

    // Merge fetched bills with local bills (deduplicate by ID)
    const localBills = bills.filter(
      (b) => isBillInShift(b, targetShift) && (b.status === 'paid' || !b.status)
    );
    const allBillsMap = new Map<string, Bill>();
    localBills.forEach((b) => allBillsMap.set(b.id, b));
    freshBills.filter((b) => isBillInShift(b, targetShift) && (b.status === 'paid' || !b.status)).forEach((b) => allBillsMap.set(b.id, b));
    const targetBills = Array.from(allBillsMap.values());

    const targetCash = targetBills.reduce(
      (s, b) => s + b.payments.filter((p) => p.mode === 'cash').reduce((a, p) => a + p.amount, 0),
      0
    );
    const targetUPI = targetBills.reduce(
      (s, b) => s + b.payments.filter((p) => p.mode === 'upi').reduce((a, p) => a + p.amount, 0),
      0
    );
    const targetCard = targetBills.reduce(
      (s, b) => s + b.payments.filter((p) => p.mode === 'card').reduce((a, p) => a + p.amount, 0),
      0
    );
    const targetRevenue = targetBills.reduce((s, b) => s + b.totalAmount, 0);

    await closeShift(
      targetShift.id,
      actualClosingBalance,
      targetRevenue,
      targetCash,
      targetUPI,
      targetCard,
      closeNotes
    );

    // Tag all closed shift bills with shift_id in Supabase
    if (targetBills.length > 0) {
      supabase.from('bills').update({ shift_id: targetShift.id }).in('id', targetBills.map((b) => b.id)).then();
    }

    setCloseNotes('');
    setActualCash('');
    setShowCloseModal(false);
    setSelectedShiftId(null);
    toast.success('Shift Closed', `${targetShift.staffName}'s shift closed and summary saved`);
  };

  // Bills for historical shift in Detail Modal (Admin only)
  const modalShiftBills = useMemo(() => {
    if (!detailModalShift) return { paid: [], voided: [], revised: [] };
    const paid = bills.filter((b) => isBillInShift(b, detailModalShift) && (b.status === 'paid' || !b.status));
    const voided = bills.filter((b) => b.status === 'void' && isBillInShift(b, detailModalShift));
    const revised = bills.filter((b) => b.status === 'revised' && isBillInShift(b, detailModalShift));
    return { paid, voided, revised };
  }, [detailModalShift, bills]);

  // Computed totals for the detail modal — prefer bill-computed values over stale DB zeros
  const modalComputedCash = modalShiftBills.paid.reduce(
    (s, b) => s + b.payments.filter((p) => p.mode === 'cash').reduce((a, p) => a + p.amount, 0), 0
  );
  const modalComputedUPI = modalShiftBills.paid.reduce(
    (s, b) => s + b.payments.filter((p) => p.mode === 'upi').reduce((a, p) => a + p.amount, 0), 0
  );
  const modalComputedCard = modalShiftBills.paid.reduce(
    (s, b) => s + b.payments.filter((p) => p.mode === 'card').reduce((a, p) => a + p.amount, 0), 0
  );
  const modalComputedRevenue = modalShiftBills.paid.reduce((s, b) => s + b.totalAmount, 0);
  const modalComputedOrders = modalShiftBills.paid.length;
  // Use computed if bills loaded, else fall back to stored DB values
  const modalCash = !loadingModalBills && modalShiftBills.paid.length > 0
    ? modalComputedCash
    : (detailModalShift?.totalCash || 0);
  const modalUPI = !loadingModalBills && modalShiftBills.paid.length > 0
    ? modalComputedUPI
    : (detailModalShift?.totalUPI || 0);
  const modalCard = !loadingModalBills && modalShiftBills.paid.length > 0
    ? modalComputedCard
    : (detailModalShift?.totalCard || 0);
  const modalRevenue = !loadingModalBills && modalShiftBills.paid.length > 0
    ? modalComputedRevenue
    : (detailModalShift?.totalRevenue || 0);
  const modalOrders = !loadingModalBills && modalShiftBills.paid.length > 0
    ? modalComputedOrders
    : (detailModalShift?.totalOrders || 0);

  // Recalculate & save a stale closed shift back to DB
  const handleRecalculateClosedShift = async (s: Shift) => {
    setRecalculating(true);
    try {
      const fetched = await fetchBillsForShift(s.id, s.staffId, s.openedAt, s.closedAt, s.staffName);
      const paid = fetched.filter((b) => isBillInShift(b, s) && (b.status === 'paid' || !b.status));
      const cash = paid.reduce((acc, b) => acc + b.payments.filter((p) => p.mode === 'cash').reduce((a, p) => a + p.amount, 0), 0);
      const upi  = paid.reduce((acc, b) => acc + b.payments.filter((p) => p.mode === 'upi').reduce((a, p) => a + p.amount, 0), 0);
      const card = paid.reduce((acc, b) => acc + b.payments.filter((p) => p.mode === 'card').reduce((a, p) => a + p.amount, 0), 0);
      const revenue = paid.reduce((acc, b) => acc + b.totalAmount, 0);
      const covers  = paid.reduce((acc, b) => acc + (b.guestCount || 0), 0);
      const orders  = paid.length;
      // Update in Supabase
      await supabase.from('shifts').update({
        total_cash: cash,
        total_upi: upi,
        total_card: card,
        total_revenue: revenue,
        total_covers: covers,
        total_orders: orders,
      }).eq('id', s.id);

      // Permanently tag matching bills with shift_id in Supabase
      if (paid.length > 0) {
        await supabase.from('bills').update({ shift_id: s.id }).in('id', paid.map((b) => b.id));
      }

      // Update detailModalShift state if modal is open for this shift
      setDetailModalShift((prev) => prev && prev.id === s.id ? {
        ...prev,
        totalCash: cash,
        totalUPI: upi,
        totalCard: card,
        totalRevenue: revenue,
        totalCovers: covers,
        totalOrders: orders,
      } : prev);

      toast.success('Recalculated', `${s.staffName}'s shift totals updated from ${orders} bills (₹${revenue.toLocaleString('en-IN')})`);
      // Refresh shift list
      useShiftStore.getState().initShiftSync();
    } catch (err) {
      console.error('Recalculate failed:', err);
      toast.error('Error', 'Failed to recalculate shift');
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <>
      <TopBar
        title="Shift Management"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => syncShiftBills(true)}
              disabled={loadingShiftBills}
              title="Sync latest shift bills from server"
            >
              <ArrowsClockwise size={16} className={loadingShiftBills ? 'animate-spin' : ''} />
              {loadingShiftBills ? 'Syncing...' : 'Sync Bills'}
            </button>

            {myActiveShift ? (
              <button
                className="btn btn-secondary btn-sm"
                style={{ color: 'var(--status-occupied)', borderColor: 'var(--status-occupied)' }}
                onClick={() => setShowCloseModal(true)}
              >
                <Lock size={16} /> Close My Shift ({myActiveShift.staffName})
              </button>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowOpenModal(true)}
              >
                <LockOpen size={16} /> Open Shift
              </button>
            )}

            {/* Admin can close another cashier's shift if necessary */}
            {isAdmin && currentShift && currentShift.id !== myActiveShift?.id && (
              <button
                className="btn btn-secondary btn-sm"
                style={{ color: 'var(--status-occupied)' }}
                onClick={() => setShowCloseModal(true)}
              >
                <Lock size={16} /> Close {currentShift.staffName}'s Shift
              </button>
            )}
          </div>
        }
      />

      <div className="page-body">
        {/* ============================================================ */}
        {/* VIEW 1: REGULAR EMPLOYEE VIEW (!isAdmin) */}
        {/* Employees can ONLY open their shift or see their active status */}
        {/* to close their shift. They NEVER see any cashier's revenue, */}
        {/* collection totals, or bill records. */}
        {/* ============================================================ */}
        {!isAdmin && (
          <>
            {myActiveShift ? (
              <div
                className="card"
                style={{
                  maxWidth: 520,
                  margin: '30px auto',
                  padding: 'var(--space-8)',
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      background: 'rgba(34, 197, 94, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#22c55e',
                      flexShrink: 0,
                    }}
                  >
                    <Timer size={32} weight="bold" />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: '1.25rem' }}>Your Shift is Active</span>
                      <span className="badge badge-success" style={{ fontSize: '0.75rem', padding: '2px 8px' }}>
                        🟢 OPEN
                      </span>
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      Cashier: <strong style={{ color: 'var(--text-primary)' }}>{currentUser?.name}</strong>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: 'var(--bg-elevated)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px 20px',
                    marginBottom: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Shift Started</span>
                    <span style={{ fontWeight: 600 }}>
                      {new Date(myActiveShift.openedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Active Duration</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                      {formatDuration(new Date(myActiveShift.openedAt))}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Drawer Opening Cash Float</span>
                    <span style={{ fontWeight: 600 }}>{formatAmount(myActiveShift.openingBalance)}</span>
                  </div>
                </div>

                <div
                  style={{
                    background: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 14px',
                    fontSize: '0.85rem',
                    color: 'var(--text-muted)',
                    marginBottom: 24,
                    lineHeight: 1.5,
                  }}
                >
                  ℹ️ Your register is open and ready for billing. When your shift ends, count the physical cash in your drawer and click below to close your shift.
                </div>

                <button
                  className="btn btn-secondary"
                  style={{
                    width: '100%',
                    padding: '14px',
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: 'var(--status-occupied)',
                    borderColor: 'var(--status-occupied)',
                  }}
                  onClick={() => setShowCloseModal(true)}
                >
                  <Lock size={18} /> Close My Shift
                </button>
              </div>
            ) : (
              <div
                className="card"
                style={{
                  maxWidth: 480,
                  margin: '40px auto',
                  padding: 'var(--space-8)',
                  textAlign: 'center',
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: 'var(--accent-dim)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                  }}
                >
                  <LockOpen size={32} color="var(--accent)" weight="bold" />
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.25rem', marginBottom: 6 }}>
                  Start Your Shift, {currentUser?.name}
                </div>
                <div
                  style={{
                    fontSize: '0.875rem',
                    color: 'var(--text-muted)',
                    marginBottom: 24,
                    lineHeight: 1.5,
                  }}
                >
                  You do not have an active shift. Enter your initial cash float in the drawer to start billing.
                </div>

                <div style={{ textAlign: 'left', marginBottom: 20 }}>
                  <label className="input-label" style={{ fontWeight: 600 }}>
                    Opening Cash Float in Till (₹)
                  </label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    placeholder="e.g. 500 or 1000"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    style={{ fontSize: '1.05rem', padding: '10px 14px' }}
                    autoFocus
                  />
                </div>

                <button
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 700 }}
                  onClick={handleOpenShift}
                >
                  <LockOpen size={18} /> Confirm & Open My Shift
                </button>
              </div>
            )}
          </>
        )}

        {/* ============================================================ */}
        {/* VIEW 2: ADMIN VIEW (isAdmin === true) */}
        {/* Full visibility: Active Cashiers bar, Live collections, Stats, */}
        {/* Paid/Void/Revised Bill tabs, and Closed Shift History table */}
        {/* ============================================================ */}
        {isAdmin && (
          <>
            <div
              style={{
                marginBottom: 20,
                padding: '14px 18px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={20} color="var(--brand-color)" weight="bold" />
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  Admin View: Active Cashiers ({activeShifts.length} Open)
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Visible to Admin only. Oversee live collection per cashier.
                </span>
              </div>

              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSelectedStaffIdForOpen('');
                  setShowOpenModal(true);
                }}
                style={{ fontSize: '0.8125rem' }}
              >
                <LockOpen size={14} /> Open Shift for Staff
              </button>
            </div>

            {activeShifts.length === 0 ? (
              <div
                style={{
                  padding: '14px',
                  textAlign: 'center',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-muted)',
                  fontSize: '0.875rem',
                }}
              >
                No active cashier shifts currently open.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                {activeShifts.map((s) => {
                  const isSelected = currentShift?.id === s.id;
                  const isMe = currentUser?.id === s.staffId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSelectedShiftId(s.id);
                        fetchBillsForShift(s.id, s.staffId, s.openedAt, s.closedAt, s.staffName);
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 4,
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-md)',
                        border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                        background: isSelected ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                        cursor: 'pointer',
                        minWidth: 190,
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            color: isSelected ? 'var(--accent)' : undefined,
                          }}
                        >
                          🟢 {s.staffName}
                        </span>
                        {isMe && (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: 4,
                              background: 'var(--brand-color)',
                              color: '#fff',
                            }}
                          >
                            YOU
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Started: {new Date(s.openedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} ({formatDuration(new Date(s.openedAt))})
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          width: '100%',
                          fontSize: '0.75rem',
                          marginTop: 2,
                        }}
                      >
                        <span style={{ color: 'var(--text-muted)' }}>Opening: ₹{s.openingBalance}</span>
                        <span style={{ fontWeight: 700, color: 'var(--status-free)' }}>
                          ₹{getShiftLiveRevenue(s)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        {/* Selected Active Shift Overview (Admin) */}
        {currentShift ? (
          <>
            {/* Live Shift Banner */}
            <div
              style={{
                background: 'linear-gradient(135deg, var(--accent-dim), transparent)',
                border: '1px solid var(--accent)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-5)',
                marginBottom: 'var(--space-5)',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Timer size={26} color="#0c0e16" weight="bold" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  Shift Active — {currentShift.staffName}
                  {currentUser?.id === currentShift.staffId && (
                    <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                      Your Shift
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Started: {new Date(currentShift.openedAt).toLocaleString('en-IN')} · Active for:{' '}
                  <strong>{formatDuration(new Date(currentShift.openedAt))}</strong>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Opening Cash in Till</div>
                <div style={{ fontWeight: 800, fontSize: '1.35rem', color: 'var(--accent)' }}>
                  {formatAmount(currentShift.openingBalance)}
                </div>
              </div>
            </div>

            {/* Live Stats */}
            <div
              className="grid grid-6"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 'var(--space-4)',
                marginBottom: 'var(--space-5)',
              }}
            >
              <div className="stat-card accent">
                <div className="stat-icon accent">
                  <CurrencyInr size={22} />
                </div>
                <div className="stat-value">{formatAmount(shiftRevenue)}</div>
                <div className="stat-label">Shift Revenue</div>
              </div>

              <div className="stat-card green">
                <div className="stat-icon green">
                  <Receipt size={22} />
                </div>
                <div className="stat-value">{shiftOrdersCount}</div>
                <div className="stat-label">Paid Orders</div>
              </div>

              <div className="stat-card blue">
                <div className="stat-icon blue">
                  <Users size={22} />
                </div>
                <div className="stat-value">{shiftCovers}</div>
                <div className="stat-label">Covers</div>
              </div>

              <div className="stat-card" style={{ background: 'rgba(16,185,129,0.08)' }}>
                <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                  <Clock size={22} />
                </div>
                <div className="stat-value" style={{ color: '#10b981' }}>
                  {formatAmount(closingBalance)}
                </div>
                <div className="stat-label">Expected Cash in Till</div>
              </div>

              {/* Voided Bills Metric */}
              <div
                className="stat-card"
                style={{
                  background: shiftVoidedBills.length > 0 ? 'rgba(239,68,68,0.08)' : 'var(--bg-surface)',
                  border: shiftVoidedBills.length > 0 ? '1px solid rgba(239,68,68,0.3)' : undefined,
                  cursor: 'pointer',
                }}
                onClick={() => setShiftTab('voided')}
                title="Click to view voided bills"
              >
                <div
                  className="stat-icon"
                  style={{
                    background: 'rgba(239,68,68,0.15)',
                    color: '#ef4444',
                  }}
                >
                  <Trash size={22} weight="bold" />
                </div>
                <div className="stat-value" style={{ color: '#ef4444' }}>
                  {shiftVoidedBills.length}
                </div>
                <div className="stat-label">
                  Voided Bills ({formatAmount(shiftVoidedTotal)})
                </div>
              </div>

              {/* Revised Bills Metric */}
              <div
                className="stat-card"
                style={{
                  background: shiftRevisedBills.length > 0 ? 'rgba(168,85,247,0.08)' : 'var(--bg-surface)',
                  border: shiftRevisedBills.length > 0 ? '1px solid rgba(168,85,247,0.3)' : undefined,
                  cursor: 'pointer',
                }}
                onClick={() => setShiftTab('revised')}
                title="Click to view revised bills"
              >
                <div
                  className="stat-icon"
                  style={{
                    background: 'rgba(168,85,247,0.15)',
                    color: '#a855f7',
                  }}
                >
                  <ArrowsClockwise size={22} weight="bold" />
                </div>
                <div className="stat-value" style={{ color: '#a855f7' }}>
                  {shiftRevisedBills.length}
                </div>
                <div className="stat-label">
                  Revised Bills ({formatAmount(shiftRevisedTotal)})
                </div>
              </div>
            </div>

            {/* Payment Mode Breakdown */}
            <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
              <div className="card-header">
                <div className="card-title">Payment Collection Breakdown ({currentShift.staffName})</div>
              </div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)' }}>
                  {[
                    { label: 'Cash in Till', amount: shiftCash, color: '#22c55e', icon: '💵' },
                    { label: 'UPI QR Collection', amount: shiftUPI, color: '#f59e0b', icon: '📱' },
                    { label: 'Card Swipes', amount: shiftCard, color: '#3b82f6', icon: '💳' },
                  ].map((p) => (
                    <div
                      key={p.label}
                      style={{
                        padding: 'var(--space-4)',
                        background: 'var(--bg-elevated)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border)',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{p.icon}</div>
                      <div style={{ fontWeight: 800, fontSize: '1.25rem', color: p.color }}>
                        {formatAmount(p.amount)}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{p.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Shift Bills Tabs (Paid, Voided, Revised) */}
            <div className="card">
              <div
                className="card-header"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div className="tabs" style={{ padding: 3 }}>
                  <button
                    className={`tab-item ${shiftTab === 'paid' ? 'active' : ''}`}
                    onClick={() => setShiftTab('paid')}
                    style={{ fontSize: '0.85rem', fontWeight: 600 }}
                  >
                    Paid Bills ({shiftBills.length})
                  </button>
                  <button
                    className={`tab-item ${shiftTab === 'voided' ? 'active' : ''}`}
                    onClick={() => setShiftTab('voided')}
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: shiftVoidedBills.length > 0 ? '#ef4444' : undefined,
                    }}
                  >
                    Voided Bills ({shiftVoidedBills.length})
                  </button>
                  <button
                    className={`tab-item ${shiftTab === 'revised' ? 'active' : ''}`}
                    onClick={() => setShiftTab('revised')}
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: shiftRevisedBills.length > 0 ? '#a855f7' : undefined,
                    }}
                  >
                    Revised Bills ({shiftRevisedBills.length})
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => syncShiftBills(true)}
                    disabled={loadingShiftBills}
                    title="Fetch latest shift bills from server"
                  >
                    <ArrowsClockwise size={14} className={loadingShiftBills ? 'animate-spin' : ''} />
                    {loadingShiftBills ? 'Syncing...' : 'Sync'}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={handlePrint}>
                    <Printer size={14} /> Print Shift Summary
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ color: 'var(--status-occupied)', borderColor: 'var(--status-occupied)' }}
                    onClick={() => setShowCloseModal(true)}
                  >
                    <Lock size={14} /> Close This Shift
                  </button>
                </div>
              </div>

              {/* Tab 1: Paid Bills */}
              {shiftTab === 'paid' && (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Time</th>
                        <th>Table/Type</th>
                        <th>Payment Mode</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shiftBills
                        .slice()
                        .reverse()
                        .map((bill) => (
                          <tr key={bill.id}>
                            <td style={{ fontWeight: 600 }}>{bill.invoiceNumber}</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                              {new Date(bill.createdAt).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td>{bill.tableNumber ? `T${bill.tableNumber}` : bill.orderType}</td>
                            <td>
                              {bill.payments.map((p, i) => (
                                <span
                                  key={i}
                                  className="badge badge-muted"
                                  style={{ marginRight: 4, textTransform: 'capitalize' }}
                                >
                                  {p.mode}
                                </span>
                              ))}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>
                              {formatAmount(bill.totalAmount)}
                            </td>
                          </tr>
                        ))}
                      {shiftBills.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                            No paid bills yet in this shift
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tab 2: Voided Bills */}
              {shiftTab === 'voided' && (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Original Time</th>
                        <th>Table/Type</th>
                        <th>Amount</th>
                        <th>Voided / Deleted By</th>
                        <th>Voided At</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shiftVoidedBills
                        .slice()
                        .reverse()
                        .map((bill) => (
                          <tr key={bill.id} style={{ background: 'rgba(239,68,68,0.02)' }}>
                            <td style={{ fontWeight: 600, color: '#ef4444' }}>{bill.invoiceNumber}</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                              {new Date(bill.createdAt).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td>{bill.tableNumber ? `T${bill.tableNumber}` : bill.orderType}</td>
                            <td style={{ fontWeight: 700, color: '#ef4444' }}>
                              {formatAmount(bill.totalAmount)}
                            </td>
                            <td>
                              <span
                                className="badge"
                                style={{
                                  background: 'rgba(239,68,68,0.15)',
                                  color: '#ef4444',
                                  fontWeight: 700,
                                }}
                              >
                                {bill.voidedBy || currentShift.staffName}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                              {bill.voidedAt
                                ? new Date(bill.voidedAt).toLocaleTimeString('en-IN', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '—'}
                            </td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                              {bill.voidReason || 'No reason provided'}
                            </td>
                          </tr>
                        ))}
                      {shiftVoidedBills.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                            No bills voided or cancelled during this shift ✓
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tab 3: Revised Bills */}
              {shiftTab === 'revised' && (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Original Time</th>
                        <th>Table/Type</th>
                        <th>Amount</th>
                        <th>Revised By</th>
                        <th>Revised At</th>
                        <th>Revision Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shiftRevisedBills
                        .slice()
                        .reverse()
                        .map((bill) => (
                          <tr key={bill.id} style={{ background: 'rgba(168,85,247,0.02)' }}>
                            <td style={{ fontWeight: 600, color: '#a855f7' }}>{bill.invoiceNumber}</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                              {new Date(bill.createdAt).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td>{bill.tableNumber ? `T${bill.tableNumber}` : bill.orderType}</td>
                            <td style={{ fontWeight: 700, color: '#a855f7' }}>
                              {formatAmount(bill.totalAmount)}
                            </td>
                            <td>
                              <span
                                className="badge"
                                style={{
                                  background: 'rgba(168,85,247,0.15)',
                                  color: '#a855f7',
                                  fontWeight: 700,
                                }}
                              >
                                {bill.revisedBy || bill.voidedBy || currentShift.staffName}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                              {bill.revisedAt
                                ? new Date(bill.revisedAt).toLocaleTimeString('en-IN', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '—'}
                            </td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                              {bill.revisedReason || 'Order modified'}
                            </td>
                          </tr>
                        ))}
                      {shiftRevisedBills.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                            No bills revised during this shift
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          /* When Admin has no active cashier shift selected */
          <div
            className="card"
            style={{
              maxWidth: 480,
              margin: '40px auto',
              padding: 'var(--space-8)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'var(--accent-dim)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <LockOpen size={32} color="var(--accent)" weight="bold" />
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.25rem', marginBottom: 6 }}>
              No Active Shift Selected
            </div>
            <div
              style={{
                fontSize: '0.875rem',
                color: 'var(--text-muted)',
                marginBottom: 24,
                lineHeight: 1.5,
              }}
            >
              Select an active cashier shift above to monitor live collections, or click below to open a shift session.
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 700 }}
              onClick={() => setShowOpenModal(true)}
            >
              <LockOpen size={18} /> Open Shift Session
            </button>
          </div>
        )}

        {/* Closed Shifts History Table (Admin only) */}
        {shifts.length > 0 && (
          <div className="card" style={{ marginTop: 'var(--space-6)' }}>
            <div className="card-header">
              <div className="card-title">Closed Shift History (Admin Audit)</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cashier</th>
                    <th>Opened</th>
                    <th>Closed</th>
                    <th>Duration</th>
                    <th>Orders</th>
                    <th>Cash</th>
                    <th>UPI</th>
                    <th>Card</th>
                    <th style={{ textAlign: 'right' }}>Revenue</th>
                    <th style={{ textAlign: 'center' }}>Details</th>
                  </tr>
                 </thead>
                 <tbody>
                   {shifts.map((rawShift) => {
                    const s = {
                      ...rawShift,
                      openedAt: new Date(rawShift.openedAt),
                      closedAt: rawShift.closedAt ? new Date(rawShift.closedAt) : undefined,
                    };
                    // Use authoritative stored DB totals for closed shifts.
                    // ONLY if stored totals are 0 (stale uncalculated shift) do we compute from local bills.
                    const isRecorded = (s.totalRevenue > 0) || (s.totalOrders > 0);
                    const sBills = !isRecorded
                      ? bills.filter((b) => isBillInShift(b, s) && (b.status === 'paid' || !b.status))
                      : [];
                    const hasBills = sBills.length > 0;
                    const dispCash = isRecorded ? s.totalCash : (hasBills ? sBills.reduce((acc, b) => acc + b.payments.filter((p) => p.mode === 'cash').reduce((a, p) => a + p.amount, 0), 0) : 0);
                    const dispUPI = isRecorded ? s.totalUPI : (hasBills ? sBills.reduce((acc, b) => acc + b.payments.filter((p) => p.mode === 'upi').reduce((a, p) => a + p.amount, 0), 0) : 0);
                    const dispCard = isRecorded ? s.totalCard : (hasBills ? sBills.reduce((acc, b) => acc + b.payments.filter((p) => p.mode === 'card').reduce((a, p) => a + p.amount, 0), 0) : 0);
                    const dispRevenue = isRecorded ? s.totalRevenue : (hasBills ? sBills.reduce((acc, b) => acc + b.totalAmount, 0) : 0);
                    const dispOrders = isRecorded ? s.totalOrders : (hasBills ? sBills.length : 0);
                    const isStale = !isRecorded && !hasBills;
                    return (
                      <tr key={s.id} style={isStale ? { opacity: 0.7 } : undefined}>
                        <td style={{ fontWeight: 600 }}>{s.staffName}</td>
                        <td style={{ fontSize: '0.85rem' }}>{s.openedAt.toLocaleString('en-IN')}</td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {s.closedAt ? s.closedAt.toLocaleString('en-IN') : '—'}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>
                          {formatDuration(s.openedAt, s.closedAt)}
                        </td>
                        <td>{dispOrders}</td>
                        <td style={{ color: '#22c55e', fontWeight: 600 }}>{formatAmount(dispCash)}</td>
                        <td style={{ color: '#f59e0b', fontWeight: 600 }}>{formatAmount(dispUPI)}</td>
                        <td style={{ color: '#3b82f6', fontWeight: 600 }}>{formatAmount(dispCard)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent)' }}>
                          {formatAmount(dispRevenue)}
                          {isStale && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>needs fix</span>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setDetailModalShift(s)}
                            >
                              <Eye size={16} /> View
                            </button>
                            {s.totalRevenue === 0 && (
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--status-occupied)', fontSize: '0.75rem' }}
                                onClick={() => handleRecalculateClosedShift(s)}
                                disabled={recalculating}
                                title="Recalculate totals from bills and save to DB"
                              >
                                <Calculator size={13} /> Fix
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    )}
  </div>

      {/* Open Shift Modal */}
      {showOpenModal && (
        <div className="modal-overlay" onClick={() => setShowOpenModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <span className="modal-title">
                <LockOpen size={18} style={{ display: 'inline', marginRight: 8 }} />
                Open Cashier Shift
              </span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowOpenModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {isAdmin ? (
                <div className="input-group" style={{ marginBottom: 14 }}>
                  <label className="input-label">Select Staff Member</label>
                  <select
                    className="input"
                    value={selectedStaffIdForOpen || currentUser?.id || ''}
                    onChange={(e) => setSelectedStaffIdForOpen(e.target.value)}
                  >
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role}) {u.id === currentUser?.id ? '— (Me)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div
                  style={{
                    background: 'var(--bg-elevated)',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 14,
                  }}
                >
                  <div>
                    Opening Shift for:{' '}
                    <strong style={{ color: 'var(--accent)' }}>{currentUser?.name}</strong>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    Role: {currentUser?.role || 'Cashier'} · Staff ID: {currentUser?.id}
                  </div>
                </div>
              )}

              <div className="input-group">
                <label className="input-label">Opening Cash in Till (₹)</label>
                <input
                  className="input"
                  type="number"
                  placeholder="e.g., 1000"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  autoFocus
                />
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Count and enter the initial cash float present in the drawer.
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowOpenModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleOpenShift}>
                Confirm & Open Shift
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Shift Modal */}
      {showCloseModal && (isAdmin ? currentShift : myActiveShift) && (
        (() => {
          const targetShift = (isAdmin ? currentShift : myActiveShift)!;
          return (
            <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
                <div className="modal-header">
                  <span className="modal-title">
                    <Lock size={18} style={{ display: 'inline', marginRight: 8 }} />
                    Close Shift ({targetShift.staffName})
                  </span>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowCloseModal(false)}>
                    ×
                  </button>
                </div>
                <div className="modal-body">
                  {isAdmin ? (
                    /* Admin gets full audit breakdown */
                    <div
                      style={{
                        background: 'var(--bg-elevated)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-4)',
                        marginBottom: 'var(--space-4)',
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>Shift Summary (Admin Audit)</div>
                      {[
                        ['Cashier', targetShift.staffName],
                        ['Duration', formatDuration(new Date(targetShift.openedAt))],
                        ['Paid Orders', shiftBills.length.toString()],
                        ['Voided Bills', `${shiftVoidedBills.length} (${formatAmount(shiftVoidedTotal)})`],
                        ['Revised Bills', `${shiftRevisedBills.length} (${formatAmount(shiftRevisedTotal)})`],
                        ['Opening Cash Float', formatAmount(targetShift.openingBalance)],
                        ['Cash Collected', formatAmount(shiftCash)],
                        ['UPI Collected', formatAmount(shiftUPI)],
                        ['Card Collected', formatAmount(shiftCard)],
                        ['Total Net Revenue', formatAmount(shiftRevenue)],
                        ['Expected Cash in Drawer', formatAmount(closingBalance)],
                        ['Float to Leave in Drawer', formatAmount(targetShift.openingBalance || 1000)],
                        ['Net Cash Handover to Safe', formatAmount(shiftCash)],
                      ].map(([k, v]) => (
                        <div
                          key={k}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '4px 0',
                            fontSize: '0.85rem',
                            borderBottom: '1px solid var(--border)',
                            color: k.includes('Handover') ? 'var(--brand-color)' : undefined,
                            fontWeight: k.includes('Handover') || k.includes('Expected') ? 700 : undefined,
                          }}
                        >
                          <span style={{ color: k.includes('Handover') ? 'var(--brand-color)' : 'var(--text-muted)' }}>{k}</span>
                          <span style={{ fontWeight: 600 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Non-Admin Employee gets blind close: strictly no financial totals */
                    <div
                      style={{
                        background: 'var(--bg-elevated)',
                        borderRadius: 'var(--radius-md)',
                        padding: '14px 16px',
                        marginBottom: 16,
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Cashier</span>
                        <span style={{ fontWeight: 700 }}>{targetShift.staffName}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Shift Duration</span>
                        <span style={{ fontWeight: 600 }}>{formatDuration(new Date(targetShift.openedAt))}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Initial Drawer Float</span>
                        <span style={{ fontWeight: 600 }}>{formatAmount(targetShift.openingBalance)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Float to Leave for Next Shift</span>
                        <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{formatAmount(targetShift.openingBalance || 1000)}</span>
                      </div>
                    </div>
                  )}

                  <div className="input-group">
                    <label className="input-label" style={{ fontWeight: 700 }}>
                      Actual Physical Cash in Till (₹) <span style={{ color: 'var(--status-occupied)' }}>*</span>
                    </label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      placeholder="Count and enter the physical cash in the drawer"
                      value={actualCash}
                      onChange={(e) => setActualCash(e.target.value)}
                      autoFocus
                    />
                    {isAdmin && actualCash && (
                      <div
                        style={{
                          fontSize: '0.8rem',
                          marginTop: 6,
                          color:
                            parseFloat(actualCash) < closingBalance
                              ? 'var(--status-occupied)'
                              : 'var(--status-free)',
                        }}
                      >
                        {parseFloat(actualCash) < closingBalance
                          ? `⚠️ Cash Short by ₹${(closingBalance - parseFloat(actualCash)).toFixed(2)} — Journal entry will be created`
                          : parseFloat(actualCash) > closingBalance
                          ? `✅ Cash Over by ₹${(parseFloat(actualCash) - closingBalance).toFixed(2)} — Journal entry will be created`
                          : '✅ Cash matches expected amount perfectly'}
                      </div>
                    )}
                    {!isAdmin && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        Count all physical cash bills and coins present in the till drawer.
                      </div>
                    )}
                  </div>

                  <div className="input-group">
                    <label className="input-label">Handover Notes (optional)</label>
                    <textarea
                      className="input"
                      rows={2}
                      placeholder="Notes on cash discrepancies, vouchers, or shift handover..."
                      value={closeNotes}
                      onChange={(e) => setCloseNotes(e.target.value)}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowCloseModal(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ background: 'var(--status-occupied)' }}
                    onClick={handleCloseShift}
                  >
                    <CheckCircle size={16} /> Confirm Close Shift
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* Historical Shift Detail Modal (Admin only) */}
      {isAdmin && detailModalShift && (
        <div className="modal-overlay" onClick={() => setDetailModalShift(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <span className="modal-title">
                Shift Report — {detailModalShift.staffName}
              </span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDetailModalShift(null)}>
                ×
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: 12,
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 16,
                  fontSize: '0.85rem',
                }}
              >
                <div>
                  <div><strong>Opened:</strong> {new Date(detailModalShift.openedAt).toLocaleString('en-IN')}</div>
                  <div><strong>Closed:</strong> {detailModalShift.closedAt ? new Date(detailModalShift.closedAt).toLocaleString('en-IN') : '—'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div><strong>Opening Cash:</strong> {formatAmount(detailModalShift.openingBalance)}</div>
                  <div><strong>Closing Cash:</strong> {formatAmount(detailModalShift.closingBalance || 0)}</div>
                </div>
              </div>

              {loadingModalBills ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  <ArrowsClockwise size={20} className="animate-spin" style={{ marginBottom: 6 }} />
                  <div>Loading bills from server...</div>
                </div>
              ) : (
                <>
                  {/* Summary row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                    <div style={{ padding: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Orders</div>
                      <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{modalOrders}</div>
                    </div>
                    <div style={{ padding: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Cash Sales</div>
                      <div style={{ fontWeight: 700, color: '#22c55e' }}>{formatAmount(modalCash)}</div>
                    </div>
                    <div style={{ padding: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>UPI Sales</div>
                      <div style={{ fontWeight: 700, color: '#f59e0b' }}>{formatAmount(modalUPI)}</div>
                    </div>
                    <div style={{ padding: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Card Sales</div>
                      <div style={{ fontWeight: 700, color: '#3b82f6' }}>{formatAmount(modalCard)}</div>
                    </div>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: 'var(--accent-dim)',
                    borderRadius: 6,
                    marginBottom: 12,
                    fontSize: '0.875rem',
                  }}>
                    <span style={{ fontWeight: 700 }}>Total Revenue: {formatAmount(modalRevenue)}</span>
                    {/* If DB values were 0 but bills found, show recalculate prompt */}
                    {(detailModalShift?.totalRevenue || 0) === 0 && modalRevenue > 0 && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--status-occupied)', fontWeight: 600 }}>
                        ⚠️ DB had 0 — computed from {modalOrders} bills
                      </span>
                    )}
                  </div>

                  {Math.abs(modalRevenue - (detailModalShift?.totalRevenue || 0)) > 1 && !loadingModalBills && (
                    <div style={{
                      marginTop: -4,
                      marginBottom: 12,
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid var(--status-occupied)',
                      fontSize: '0.82rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <span>⚠️ Live bills in database ({formatAmount(modalRevenue)}) differ from saved summary ({formatAmount(detailModalShift?.totalRevenue)}).</span>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.75rem', padding: '3px 10px', color: 'var(--brand-color)', fontWeight: 700 }}
                        onClick={() => handleRecalculateClosedShift(detailModalShift)}
                        disabled={recalculating}
                      >
                        ⚡ Sync Summary
                      </button>
                    </div>
                  )}

                  {/* Cash Drawer Reconciliation */}
                  <div style={{
                    background: 'var(--bg-elevated)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 14px',
                    marginBottom: 14,
                    border: '1px solid var(--border)',
                    fontSize: '0.85rem'
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>💵 Cash Drawer & Handover Breakdown</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>Expected vs Handover</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Opening Float (Starting Change):</span>
                      <span style={{ fontWeight: 600 }}>{formatAmount(detailModalShift.openingBalance)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Cash Sales Collected:</span>
                      <span style={{ fontWeight: 600, color: '#22c55e' }}>+ {formatAmount(modalCash)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: '1px dashed var(--border)', fontWeight: 700 }}>
                      <span>Expected Cash in Drawer:</span>
                      <span>{formatAmount((detailModalShift.openingBalance || 0) + modalCash)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Float Left for Next Shift:</span>
                      <span style={{ fontWeight: 600, color: 'var(--accent)' }}>− {formatAmount(detailModalShift.openingBalance || 1000)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: '1px dashed var(--border)', fontWeight: 700, color: 'var(--brand-color)' }}>
                      <span>Net Cash to Hand Over to Safe:</span>
                      <span>{formatAmount(modalCash)}</span>
                    </div>
                    {detailModalShift.closingBalance !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', marginTop: 8, background: 'var(--bg-surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Actual Cash Count Entered:</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Physical count typed by cashier upon closing</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{formatAmount(detailModalShift.closingBalance)}</span>
                          {(() => {
                            const expected = (detailModalShift.openingBalance || 0) + modalCash;
                            const diff = (detailModalShift.closingBalance || 0) - expected;
                            if (Math.abs(diff) < 0.01) {
                              return <div style={{ fontSize: '0.7rem', color: 'var(--status-free)', fontWeight: 600 }}>Exact Match ✅</div>;
                            }
                            return (
                              <div style={{ fontSize: '0.7rem', color: diff > 0 ? 'var(--accent)' : 'var(--status-occupied)', fontWeight: 600 }}>
                                {diff > 0 ? `+${formatAmount(diff)} Over` : `-${formatAmount(Math.abs(diff))} Short`}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Voided Bills in this past shift */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#ef4444', marginBottom: 6 }}>
                  Voided / Deleted Bills ({modalShiftBills.voided.length})
                </div>
                {modalShiftBills.voided.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>None voided in this shift</div>
                ) : (
                  <table className="data-table" style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Amount</th>
                        <th>Voided By</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalShiftBills.voided.map((b) => (
                        <tr key={b.id}>
                          <td>{b.invoiceNumber}</td>
                          <td>{formatAmount(b.totalAmount)}</td>
                          <td>{b.voidedBy || detailModalShift.staffName}</td>
                          <td>{b.voidReason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Revised Bills in this past shift */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#a855f7', marginBottom: 6 }}>
                  Revised Bills ({modalShiftBills.revised.length})
                </div>
                {modalShiftBills.revised.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>None revised in this shift</div>
                ) : (
                  <table className="data-table" style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Amount</th>
                        <th>Revised By</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalShiftBills.revised.map((b) => (
                        <tr key={b.id}>
                          <td>{b.invoiceNumber}</td>
                          <td>{formatAmount(b.totalAmount)}</td>
                          <td>{b.revisedBy || detailModalShift.staffName}</td>
                          <td>{b.revisedReason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <div className="modal-footer">
              {/* Recalculate & Save button to fix stale 0 values */}
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleRecalculateClosedShift(detailModalShift)}
                disabled={recalculating || loadingModalBills}
                title="Recompute totals from actual bills and save to database"
              >
                <Calculator size={14} />
                {recalculating ? 'Saving...' : 'Fix & Save Totals'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setDetailModalShift(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Print Summary Section (Admin only) */}
      {isAdmin && (
        <div style={{ display: 'none' }}>
          <div ref={printRef} className="bill-print">
          <div className="bill-center bill-bold" style={{ fontSize: 14 }}>
            SHIFT CLOSING REPORT
          </div>
          <div className="bill-center" style={{ fontSize: 11, fontWeight: 'bold' }}>
            Cashier: {currentShift?.staffName || ''}
          </div>
          <div className="bill-hr" />
          {[
            ['Shift Start', currentShift ? new Date(currentShift.openedAt).toLocaleString('en-IN') : ''],
            ['Shift Closed', currentShift?.closedAt ? new Date(currentShift.closedAt).toLocaleString('en-IN') : new Date().toLocaleString('en-IN')],
            ['Duration', currentShift ? formatDuration(new Date(currentShift.openedAt), currentShift.closedAt ? new Date(currentShift.closedAt) : undefined) : ''],
            ['Total Paid Orders', shiftBills.length.toString()],
            ['Total Covers', shiftCovers.toString()],
            ['Opening Cash Float', `₹${(currentShift?.openingBalance || 0).toFixed(2)}`],
            ['Cash Collected', `₹${shiftCash.toFixed(2)}`],
            ['UPI Collected', `₹${shiftUPI.toFixed(2)}`],
            ['Card Collected', `₹${shiftCard.toFixed(2)}`],
            ['Total Sales Revenue', `₹${shiftRevenue.toFixed(2)}`],
            ['Expected Cash Balance', `₹${closingBalance.toFixed(2)}`],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}
            >
              <span>{k}</span>
              <span style={{ fontWeight: 'bold' }}>{v}</span>
            </div>
          ))}

          {/* Voided Bills Section in Print */}
          <div className="bill-hr" />
          <div style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 4 }}>
            VOIDED / DELETED BILLS ({shiftVoidedBills.length}) — Total: ₹{shiftVoidedTotal.toFixed(2)}
          </div>
          {shiftVoidedBills.map((vb) => (
            <div key={vb.id} style={{ fontSize: 9, marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
              <span>
                {vb.invoiceNumber} (by {vb.voidedBy || 'Staff'}): {vb.voidReason || 'Void'}
              </span>
              <span style={{ fontWeight: 'bold' }}>₹{vb.totalAmount.toFixed(2)}</span>
            </div>
          ))}
          {shiftVoidedBills.length === 0 && (
            <div style={{ fontSize: 9, color: '#666' }}>No voided bills</div>
          )}

          {/* Revised Bills Section in Print */}
          <div className="bill-hr" />
          <div style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 4 }}>
            REVISED BILLS ({shiftRevisedBills.length}) — Total: ₹{shiftRevisedTotal.toFixed(2)}
          </div>
          {shiftRevisedBills.map((rb) => (
            <div key={rb.id} style={{ fontSize: 9, marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
              <span>
                {rb.invoiceNumber} (by {rb.revisedBy || 'Staff'}): {rb.revisedReason || 'Revised'}
              </span>
              <span style={{ fontWeight: 'bold' }}>₹{rb.totalAmount.toFixed(2)}</span>
            </div>
          ))}
          {shiftRevisedBills.length === 0 && (
            <div style={{ fontSize: 9, color: '#666' }}>No revised bills</div>
          )}

          <div className="bill-hr" />
          <div className="bill-center" style={{ fontSize: 9 }}>
            Printed: {new Date().toLocaleString('en-IN')}
          </div>
        </div>
      </div>
      )}
    </>
  );
}
