import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Bill } from '../types';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from './settingsStore';
import { useAccountingStore } from './accountingStore';
import { useShiftStore } from './shiftStore';

export interface CustomerBillSummary {
  id: string;
  invoiceNumber: string;
  customerName?: string;
  customerPhone?: string;
  totalAmount: number;
  tableNumber?: string;
  payments?: { mode: string; amount: number }[];
  createdAt: Date;
}

interface BillState {
  bills: Bill[];
  addBill: (bill: Bill) => Promise<void>;
  voidBill: (billId: string, voidedBy: string, voidReason?: string, shiftId?: string) => Promise<void>;
  reviseBill: (billId: string, revisedBy: string, revisedReason?: string, shiftId?: string) => Promise<void>;
  fetchBillsByDateRange: (
    startDate: Date,
    endDate: Date,
    page?: number,
    limit?: number,
    staffFilter?: { staffId?: string; staffName?: string }
  ) => Promise<{ bills: Bill[]; total: number }>;
  fetchAllBillsForDateRange: (
    startDate: Date,
    endDate: Date,
    staffFilter?: { staffId?: string; staffName?: string }
  ) => Promise<Bill[]>;
  fetchCustomerBills: (startDate?: Date, endDate?: Date) => Promise<CustomerBillSummary[]>;
  pendingSyncBillIds: string[];
  syncPendingBills: () => Promise<{ syncedCount: number; remainingCount: number }>;
  syncAllLocalBillsToCloud: () => Promise<{ uploaded: number; total: number }>;
  initBillSync: () => void;
  refreshTodayBills: () => Promise<void>;
  fetchBillsForShift: (shiftId: string, staffId?: string, openedAt?: Date, closedAt?: Date) => Promise<Bill[]>;
}

export function mapDbBill(b: any): Bill {
  const isRevised = b.status === 'revised' || (typeof b.void_reason === 'string' && b.void_reason.startsWith('[REVISED]'));
  const isVoid = b.status === 'void' && !isRevised;
  const status: 'paid' | 'void' | 'revised' = isRevised ? 'revised' : isVoid ? 'void' : 'paid';

  let revisedReason = isRevised ? b.void_reason?.replace(/^\[REVISED\]\s*/, '') : undefined;
  if (!revisedReason && isRevised) revisedReason = 'Bill revised';

  return {
    id: b.id,
    invoiceNumber: b.invoice_number,
    orderId: b.order_id,
    tableId: b.table_id || undefined,
    tableNumber: b.table_number || undefined,
    orderType: b.order_type as any,
    items: b.items as any,
    subtotal: Number(b.subtotal),
    gstBreakdown: [],
    totalGST: Number(b.total_gst),
    cgstAmount: Number(b.cgst_amount || 0),
    sgstAmount: Number(b.sgst_amount || 0),
    igstAmount: Number(b.igst_amount || 0),
    serviceCharge: Number(b.service_charge),
    serviceChargePercent: 0,
    discountType: 'flat' as const,
    discountValue: 0,
    discountAmount: Number(b.discount_amount),
    roundOff: 0,
    totalAmount: Number(b.total_amount),
    payments: b.payments as any,
    amountPaid: Number(b.total_amount),
    changeDue: 0,
    staffName: b.staff_name,
    status,
    voidedBy: isVoid ? b.voided_by || undefined : undefined,
    voidedAt: isVoid && b.voided_at ? new Date(b.voided_at) : undefined,
    voidReason: isVoid ? b.void_reason || undefined : undefined,
    voidShiftId: b.void_shift_id || undefined,
    revisedBy: isRevised ? b.revised_by || b.voided_by || undefined : undefined,
    revisedAt: isRevised && (b.revised_at || b.voided_at) ? new Date(b.revised_at || b.voided_at) : undefined,
    revisedReason: isRevised ? b.revised_reason || revisedReason : undefined,
    revisedShiftId: b.revised_shift_id || b.void_shift_id || undefined,
    guestCount: b.guest_count,
    customerName: b.customer_name || undefined,
    customerPhone: b.customer_phone || undefined,
    customerGstin: b.customer_gstin || undefined,
    placeOfSupply: b.place_of_supply || undefined,
    hsnCodes: b.hsn_codes || undefined,
    isGstBill: b.is_gst_bill !== false,
    createdAt: new Date(b.created_at),
    outletName: '',
    outletAddress: '',
    outletGSTIN: b.outlet_gstin || '',
    shiftId: b.shift_id || undefined,
    staffId: b.staff_id || undefined,
  };
}

const isValidUuid = (val: any) =>
  typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

export function mapBillToPayload(bill: Bill): any {
  const createdIso = (bill.createdAt instanceof Date ? bill.createdAt : new Date(bill.createdAt || Date.now())).toISOString();
  
  // Guard UUID fields to prevent DB invalid syntax errors
  const validOrderId = isValidUuid(bill.orderId) ? bill.orderId : crypto.randomUUID();
  const validTableId = isValidUuid(bill.tableId) ? bill.tableId : null;
  const validShiftId = isValidUuid(bill.shiftId) ? bill.shiftId : null;
  const validVoidShiftId = isValidUuid(bill.voidShiftId) ? bill.voidShiftId : null;

  return {
    id: bill.id,
    invoice_number: bill.invoiceNumber,
    order_id: validOrderId,
    table_id: validTableId,
    table_number: bill.tableNumber ? String(bill.tableNumber) : null,
    order_type: bill.orderType,
    items: Array.isArray(bill.items) ? bill.items : [],
    subtotal: Number(bill.subtotal || 0),
    total_gst: Number(bill.totalGST || 0),
    cgst_amount: Number(bill.cgstAmount ?? 0),
    sgst_amount: Number(bill.sgstAmount ?? 0),
    igst_amount: Number(bill.igstAmount ?? 0),
    service_charge: Number(bill.serviceCharge || 0),
    discount_amount: Number(bill.discountAmount || 0),
    total_amount: Number(bill.totalAmount || 0),
    payments: Array.isArray(bill.payments) ? bill.payments : [],
    staff_name: bill.staffName || null,
    status: bill.status || 'paid',
    guest_count: typeof bill.guestCount === 'number' ? bill.guestCount : null,
    customer_name: bill.customerName || null,
    customer_phone: bill.customerPhone || null,
    customer_gstin: bill.customerGstin || null,
    hsn_codes: bill.hsnCodes || null,
    place_of_supply: bill.placeOfSupply || null,
    outlet_gstin: bill.outletGSTIN || null,
    is_gst_bill: bill.isGstBill !== false,
    shift_id: validShiftId,
    staff_id: bill.staffId || null,
    created_at: createdIso,
    voided_by: bill.voidedBy || null,
    voided_at: bill.voidedAt ? (bill.voidedAt instanceof Date ? bill.voidedAt.toISOString() : new Date(bill.voidedAt).toISOString()) : null,
    void_reason: bill.voidReason || null,
    void_shift_id: validVoidShiftId,
    revised_by: bill.revisedBy || null,
    revised_at: bill.revisedAt ? (bill.revisedAt instanceof Date ? bill.revisedAt.toISOString() : new Date(bill.revisedAt).toISOString()) : null,
    revised_reason: bill.revisedReason || null,
  };
}

export const useBillStore = create<BillState>()(
  persist(
    (set, get) => ({
      bills: [],
      pendingSyncBillIds: [],

      addBill: async (bill: Bill) => {
        // Guard: skip if this bill ID is already in local state (prevents double-save on retry)
        if (get().bills.some((b) => b.id === bill.id)) {
          console.warn('[addBill] Duplicate bill ID detected, skipping:', bill.id);
          return;
        }

        // Save locally FIRST for instant UI — billing never waits for the network
        const newBill = { ...bill, status: bill.status || ('paid' as const) };
        set((state) => ({
          bills: [newBill, ...state.bills.filter((b) => b.id !== newBill.id)],
          pendingSyncBillIds: Array.from(new Set([...(state.pendingSyncBillIds || []), bill.id])),
        }));

        const billPayload = mapBillToPayload(newBill);

        try {
          const { error } = await supabase.from('bills').upsert(billPayload, { onConflict: 'id' });
          if (!error) {
            set((state) => ({
              pendingSyncBillIds: (state.pendingSyncBillIds || []).filter((id) => id !== bill.id),
            }));
            console.log('[addBill] Synced to Supabase ✓', bill.invoiceNumber);
          } else {
            console.warn('[addBill] Supabase upsert error, bill queued for offline retry:', error.message);
            // Fallback for integer table_number column if DB column has not been converted to TEXT yet
            if (error.code === '22P02' || error.message?.includes('integer')) {
              const numOnly = parseInt(String(bill.tableNumber || '').replace(/\D/g, ''), 10);
              billPayload.table_number = isNaN(numOnly) ? null : numOnly;
              const { error: retryError } = await supabase.from('bills').upsert(billPayload, { onConflict: 'id' });
              if (!retryError) {
                set((state) => ({
                  pendingSyncBillIds: (state.pendingSyncBillIds || []).filter((id) => id !== bill.id),
                }));
                console.log('[addBill] Synced with fallback table_number ✓', bill.invoiceNumber);
              }
            }
          }
        } catch (err) {
          console.warn('[addBill] Offline: bill stored locally and queued for auto-sync:', bill.invoiceNumber);
        }
      },

      syncPendingBills: async () => {
        // Collect IDs: explicitly queued pending IDs AND any local bill from the last 48 hours
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 2);

        const allBills = get().bills || [];
        const pendingSet = new Set<string>(get().pendingSyncBillIds || []);

        // Also check any local bill from the last 48 hours that might not have been recorded in pendingSyncBillIds (e.g. from v3.4.5)
        allBills.forEach((b) => {
          const d = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
          if (d >= cutoff) {
            pendingSet.add(b.id);
          }
        });

        if (pendingSet.size === 0) return { syncedCount: 0, remainingCount: 0 };

        const candidateBills = allBills.filter((b) => pendingSet.has(b.id));
        if (candidateBills.length === 0) {
          set({ pendingSyncBillIds: [] });
          return { syncedCount: 0, remainingCount: 0 };
        }

        const BATCH_SIZE = 25;
        const syncedIds: string[] = [];

        for (let i = 0; i < candidateBills.length; i += BATCH_SIZE) {
          const chunk = candidateBills.slice(i, i + BATCH_SIZE);
          const payloads = chunk.map(mapBillToPayload);

          try {
            const { error } = await supabase.from('bills').upsert(payloads, { onConflict: 'id' });
            if (!error) {
              chunk.forEach((b) => syncedIds.push(b.id));
            } else {
              // If batch upsert had an error, try one by one with table_number fallback
              for (const bill of chunk) {
                try {
                  const p = mapBillToPayload(bill);
                  const { error: sErr } = await supabase.from('bills').upsert(p, { onConflict: 'id' });
                  if (!sErr) {
                    syncedIds.push(bill.id);
                  } else if (sErr.code === '22P02' || sErr.message?.includes('integer')) {
                    const numOnly = parseInt(String(bill.tableNumber || '').replace(/\D/g, ''), 10);
                    p.table_number = isNaN(numOnly) ? null : numOnly;
                    const { error: rErr } = await supabase.from('bills').upsert(p, { onConflict: 'id' });
                    if (!rErr) syncedIds.push(bill.id);
                  }
                } catch (_) {}
              }
            }
          } catch (_) {
            // Network failure — stop and retry on next cycle
            break;
          }
        }

        let remaining = 0;
        if (syncedIds.length > 0) {
          set((state) => {
            const nextPending = (state.pendingSyncBillIds || []).filter((id) => !syncedIds.includes(id));
            remaining = nextPending.length;
            return { pendingSyncBillIds: nextPending };
          });
          console.log(`[syncPendingBills] Successfully synced ${syncedIds.length} bills to Supabase ✓`);
        } else {
          remaining = (get().pendingSyncBillIds || []).length;
        }

        return { syncedCount: syncedIds.length, remainingCount: remaining };
      },

      syncAllLocalBillsToCloud: async () => {
        const allBills = get().bills || [];
        if (allBills.length === 0) return { uploaded: 0, total: 0 };

        const BATCH_SIZE = 25;
        let uploaded = 0;

        for (let i = 0; i < allBills.length; i += BATCH_SIZE) {
          const chunk = allBills.slice(i, i + BATCH_SIZE);
          const payloads = chunk.map(mapBillToPayload);
          try {
            const { error } = await supabase.from('bills').upsert(payloads, { onConflict: 'id' });
            if (!error) {
              uploaded += chunk.length;
            } else {
              for (const bill of chunk) {
                try {
                  const p = mapBillToPayload(bill);
                  const { error: sErr } = await supabase.from('bills').upsert(p, { onConflict: 'id' });
                  if (!sErr) uploaded++;
                } catch (_) {}
              }
            }
          } catch (_) {
            break;
          }
        }

        set({ pendingSyncBillIds: [] });
        return { uploaded, total: allBills.length };
      },

  voidBill: async (billId: string, voidedBy: string, voidReason?: string, shiftId?: string) => {
    const targetBill = get().bills.find((b) => b.id === billId);
    const voidedAt = new Date();
    // Optimistic UI update
    set((state) => ({
      bills: state.bills.map((b) =>
        b.id === billId
          ? {
              ...b,
              status: 'void' as const,
              voidedBy,
              voidedAt,
              voidReason: voidReason || '',
              voidShiftId: shiftId || b.shiftId,
            }
          : b
      ),
    }));

    // Reverse payment & totals from cashier's shift
    if (targetBill) {
      useShiftStore.getState().voidBillInShift(targetBill, shiftId);
    }

    // Update in Supabase
    const { error } = await supabase
      .from('bills')
      .update({
        status: 'void',
        voided_by: voidedBy,
        voided_at: voidedAt.toISOString(),
        void_reason: voidReason || null,
        void_shift_id: shiftId || null,
      })
      .eq('id', billId);

    if (error) {
      console.error('Failed to void bill in Supabase:', error);
    }
  },

  reviseBill: async (billId: string, revisedBy: string, revisedReason?: string, shiftId?: string) => {
    const targetBill = get().bills.find((b) => b.id === billId);
    const revisedAt = new Date();
    // Optimistic UI update
    set((state) => ({
      bills: state.bills.map((b) =>
        b.id === billId
          ? {
              ...b,
              status: 'revised' as const,
              revisedBy,
              revisedAt,
              revisedReason: revisedReason || 'Bill revised',
              revisedShiftId: shiftId || b.shiftId,
            }
          : b
      ),
    }));

    // Reverse from shift because the bill is reopened into a new order to be billed again
    if (targetBill) {
      useShiftStore.getState().voidBillInShift(targetBill, shiftId);
    }

    // Update in Supabase
    const { error } = await supabase
      .from('bills')
      .update({
        status: 'revised',
        voided_by: revisedBy,
        voided_at: revisedAt.toISOString(),
        void_reason: `[REVISED] ${revisedReason || 'Bill revised'}`,
        revised_by: revisedBy,
        revised_at: revisedAt.toISOString(),
        revised_reason: revisedReason || 'Bill revised',
        void_shift_id: shiftId || null,
      })
      .eq('id', billId);

    if (error) {
      console.error('Failed to mark bill revised in Supabase:', error);
    }
  },

  fetchBillsByDateRange: async (
    startDate: Date,
    endDate: Date,
    page = 1,
    limit = 50,
    staffFilter?: { staffId?: string; staffName?: string }
  ) => {
    // 1. Immediately trigger background sync for any pending offline bills
    if (typeof window !== 'undefined' && navigator.onLine && (get().pendingSyncBillIds?.length || 0) > 0) {
      get().syncPendingBills().catch(() => {});
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Helper to extract matching local bills
    const getMatchingLocalBills = () => {
      return (get().bills || [])
        .filter((b) => {
          const d = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
          if (d < startDate || d > endDate) return false;
          if (!staffFilter) return true;
          const matchId = staffFilter.staffId && b.staffId && String(b.staffId).trim() === String(staffFilter.staffId).trim();
          const matchName = staffFilter.staffName && b.staffName && b.staffName.toLowerCase().trim() === staffFilter.staffName.toLowerCase().trim();
          return Boolean(matchId || matchName);
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    };

    try {
      let dataQuery = supabase
        .from('bills')
        .select('id,invoice_number,order_id,table_id,table_number,order_type,items,subtotal,total_gst,cgst_amount,sgst_amount,igst_amount,service_charge,discount_amount,total_amount,payments,staff_name,status,voided_by,voided_at,void_reason,guest_count,customer_name,customer_phone,customer_gstin,place_of_supply,hsn_codes,is_gst_bill,outlet_gstin,shift_id,staff_id,void_shift_id,revised_by,revised_at,revised_reason,created_at')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      let countQuery = supabase
        .from('bills')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (staffFilter?.staffId && staffFilter?.staffName) {
        dataQuery = dataQuery.or(`staff_id.eq.${staffFilter.staffId},staff_name.ilike.%${staffFilter.staffName.trim()}%`);
        countQuery = countQuery.or(`staff_id.eq.${staffFilter.staffId},staff_name.ilike.%${staffFilter.staffName.trim()}%`);
      } else if (staffFilter?.staffId) {
        dataQuery = dataQuery.eq('staff_id', staffFilter.staffId);
        countQuery = countQuery.eq('staff_id', staffFilter.staffId);
      } else if (staffFilter?.staffName) {
        dataQuery = dataQuery.ilike('staff_name', `%${staffFilter.staffName.trim()}%`);
        countQuery = countQuery.ilike('staff_name', `%${staffFilter.staffName.trim()}%`);
      }

      // Run data and lightweight count in parallel without statement timeout
      const [dataRes, countRes] = await Promise.all([
        dataQuery.order('created_at', { ascending: false }).range(from, to),
        countQuery,
      ]);

      const data = dataRes.data;
      const error = dataRes.error;
      const count = countRes.count ?? (data ? data.length + from : 0);

      if (error || !data) {
        console.warn('[fetchBillsByDateRange] Supabase query failed or offline, returning matching local bills:', error?.message);
        const local = getMatchingLocalBills();
        return { bills: local.slice(from, to + 1), total: local.length };
      }

      const mapped = data.map(mapDbBill);

      // On first page, seamlessly prepend any local bills that are pending sync or not yet in Supabase
      if (page === 1) {
        const dbIds = new Set(mapped.map((b) => b.id));
        const unsyncedLocal = getMatchingLocalBills().filter((b) => !dbIds.has(b.id));
        if (unsyncedLocal.length > 0) {
          const combined = [...unsyncedLocal, ...mapped];
          return { bills: combined.slice(0, limit), total: (count ?? mapped.length) + unsyncedLocal.length };
        }
      }

      return { bills: mapped, total: count ?? mapped.length };
    } catch (err) {
      console.warn('[fetchBillsByDateRange] Network error, using local fallback:', err);
      const local = getMatchingLocalBills();
      return { bills: local.slice(from, to + 1), total: local.length };
    }
  },

  fetchAllBillsForDateRange: async (
    startDate: Date,
    endDate: Date,
    staffFilter?: { staffId?: string; staffName?: string }
  ) => {
    let allBills: Bill[] = [];
    let page = 1;
    const limit = 1000;
    
    while (true) {
      const { bills, total } = await get().fetchBillsByDateRange(startDate, endDate, page, limit, staffFilter);
      allBills = [...allBills, ...bills];
      if (allBills.length >= total || bills.length < limit) {
        break;
      }
      page++;
    }
    return allBills;
  },

  fetchCustomerBills: async (startDate?: Date, endDate?: Date) => {
    try {
      // Lean projection: Only download 8 essential columns, strictly omitting `items` JSON
      let query = supabase
        .from('bills')
        .select('id,invoice_number,customer_name,customer_phone,total_amount,table_number,payments,created_at')
        .neq('status', 'void')
        .or('customer_phone.not.is.null,customer_name.not.is.null')
        .order('created_at', { ascending: false });

      if (startDate) query = query.gte('created_at', startDate.toISOString());
      if (endDate) query = query.lte('created_at', endDate.toISOString());

      const { data, error } = await query.limit(5000);
      if (error || !data) {
        console.warn('[fetchCustomerBills] Remote query failed or columns not found (using local bills):', error?.message);
        return [];
      }

      return data.map((b: any) => ({
        id: b.id,
        invoiceNumber: b.invoice_number,
        customerName: b.customer_name || undefined,
        customerPhone: b.customer_phone || undefined,
        totalAmount: Number(b.total_amount || 0),
        tableNumber: b.table_number || undefined,
        payments: b.payments as any,
        createdAt: new Date(b.created_at),
      }));
    } catch (err) {
      console.warn('[fetchCustomerBills] Error querying customer bills:', err);
      return [];
    }
  },

  refreshTodayBills: async () => {
    // Force re-fetch today's bills from Supabase — used by Dashboard Refresh button
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('bills')
      .select('id,invoice_number,order_id,table_id,table_number,order_type,items,subtotal,total_gst,cgst_amount,sgst_amount,igst_amount,service_charge,discount_amount,total_amount,payments,staff_name,status,voided_by,voided_at,void_reason,guest_count,customer_name,customer_phone,customer_gstin,place_of_supply,hsn_codes,is_gst_bill,outlet_gstin,shift_id,staff_id,void_shift_id,revised_by,revised_at,revised_reason,created_at')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(2000);

    if (error || !data) return;

    const fresh = data.map(mapDbBill);

    set((state) => {
      const existingMap = new Map(state.bills.map((b) => [b.id, b]));
      fresh.forEach((b) => existingMap.set(b.id, b));
      const merged = Array.from(existingMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return { bills: merged };
    });
  },

  initBillSync: async () => {
    // 1. Immediately register offline/online listeners and background sync workers (never block on network calls)
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[initBillSync] Device back online — syncing queued offline bills...');
        get().syncPendingBills().catch(() => {});
      });

      // Auto-sync on boot and every 25 seconds
      get().syncPendingBills().catch(() => {});
      setInterval(() => {
        if (navigator.onLine) {
          get().syncPendingBills().catch(() => {});
        }
      }, 20000);
    }

    // 2. Fetch past 48 hours of bills on startup inside safe try/catch
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 2);
      startDate.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('bills')
        .select('id,invoice_number,order_id,table_id,table_number,order_type,items,subtotal,total_gst,cgst_amount,sgst_amount,igst_amount,service_charge,discount_amount,total_amount,payments,staff_name,status,voided_by,voided_at,void_reason,guest_count,customer_name,customer_phone,customer_gstin,place_of_supply,hsn_codes,is_gst_bill,outlet_gstin,shift_id,staff_id,void_shift_id,revised_by,revised_at,revised_reason,created_at')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(250);

      if (!error && data) {
        const dbBills = data.map(mapDbBill);

        // Deduplicate DB bills strictly by primary key ID — NEVER by invoice_number
        const seenIds = new Set<string>();
        const list: Bill[] = [];
        for (const b of dbBills) {
          if (!seenIds.has(b.id)) {
            seenIds.add(b.id);
            list.push(b);
          }
        }

        // Merge: DB is source of truth, while preserving local-only bills
        set((state) => {
          const existingMap = new Map(state.bills.map((b) => [b.id, b]));
          for (const b of list) {
            existingMap.set(b.id, b);
          }
          const merged = Array.from(existingMap.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          return { bills: merged };
        });

        // Sync the invoice counter based on the bills we just fetched
        dbBills.forEach((b) => useSettingsStore.getState().syncInvoiceCounter(b.invoiceNumber));
      }

      // Real-time listener on public.bills so admin and cashier devices receive cross-device bill creations instantly
      const staleChannel = supabase.getChannels().find((c) => c.topic === 'realtime:bills-realtime-sync');
      if (staleChannel) supabase.removeChannel(staleChannel);

      supabase
        .channel('bills-realtime-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload as any;
          if (eventType === 'DELETE') {
            set((state) => ({
              bills: state.bills.filter((b) => b.id !== oldRow.id),
            }));
            return;
          }

          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const mapped = mapDbBill(newRow);
            set((state) => {
              const existingIdx = state.bills.findIndex((b) => b.id === mapped.id);
              if (existingIdx >= 0) {
                const updated = [...state.bills];
                updated[existingIdx] = mapped;
                return { bills: updated };
              }
              return { bills: [mapped, ...state.bills] };
            });
          }
        })
        .subscribe();
    } catch (err) {
      console.warn('[initBillSync] Boot fetch error or offline:', err);
    }
  },

  fetchBillsForShift: async (shiftId: string, staffId?: string, openedAt?: Date, closedAt?: Date) => {
    if (!shiftId) return [];

    try {
      let query = supabase
        .from('bills')
        .select('id,invoice_number,order_id,table_id,table_number,order_type,items,subtotal,total_gst,cgst_amount,sgst_amount,igst_amount,service_charge,discount_amount,total_amount,payments,staff_name,status,voided_by,voided_at,void_reason,guest_count,customer_name,customer_phone,customer_gstin,place_of_supply,hsn_codes,is_gst_bill,outlet_gstin,shift_id,staff_id,void_shift_id,revised_by,revised_at,revised_reason,created_at');

      if (openedAt) {
        const startIso = (openedAt instanceof Date ? openedAt : new Date(openedAt)).toISOString();
        if (closedAt) {
          const endIso = (closedAt instanceof Date ? closedAt : new Date(closedAt)).toISOString();
          query = query.or(`shift_id.eq.${shiftId},and(created_at.gte.${startIso},created_at.lte.${endIso})`);
        } else {
          query = query.or(`shift_id.eq.${shiftId},and(created_at.gte.${startIso})`);
        }
      } else {
        query = query.eq('shift_id', shiftId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error || !data) {
        console.error('[fetchBillsForShift] Error fetching bills from Supabase:', error);
        return [];
      }

      const mapped = data.map(mapDbBill);
      set((state) => {
        const existingMap = new Map(state.bills.map((b) => [b.id, b]));
        mapped.forEach((b) => existingMap.set(b.id, b));
        const merged = Array.from(existingMap.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        return { bills: merged };
      });

      return mapped;
    } catch (err) {
      console.error('[fetchBillsForShift] Network error fetching shift bills:', err);
      return [];
    }
  },
    }),
    {
      name: 'bill-storage',
      // We are persisting it so that even if Supabase is missing columns (like guest_count), local state remains
    }
  )
);
