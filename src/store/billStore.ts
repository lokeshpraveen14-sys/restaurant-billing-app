import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Bill } from '../types';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from './settingsStore';
import { useAccountingStore } from './accountingStore';

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

export const useBillStore = create<BillState>()(
  persist(
    (set, get) => ({
      bills: [],

      addBill: async (bill: Bill) => {
        // Guard: skip if this bill ID is already in local state (prevents double-save on retry)
        if (get().bills.some((b) => b.id === bill.id)) {
          console.warn('[addBill] Duplicate bill ID detected, skipping:', bill.id);
          return;
        }

        // Save locally FIRST for instant UI — billing never waits for the network
        const newBill = { ...bill, status: bill.status || ('paid' as const) };
        set((state) => ({ bills: [newBill, ...state.bills.filter((b) => b.id !== newBill.id)] }));

        const createdIso = (bill.createdAt instanceof Date ? bill.createdAt : new Date(bill.createdAt || Date.now())).toISOString();

        // Push to Supabase in the BACKGROUND — don't await, don't block the UI
        supabase.from('bills').upsert({
          id: bill.id,
          invoice_number: bill.invoiceNumber,
          order_id: bill.orderId,
          table_id: bill.tableId || null,
          table_number: bill.tableNumber || null,
          order_type: bill.orderType,
          items: bill.items,
          subtotal: bill.subtotal,
          total_gst: bill.totalGST,
          cgst_amount: bill.cgstAmount ?? 0,
          sgst_amount: bill.sgstAmount ?? 0,
          igst_amount: bill.igstAmount ?? 0,
          service_charge: bill.serviceCharge,
          discount_amount: bill.discountAmount,
          total_amount: bill.totalAmount,
          payments: bill.payments,
          staff_name: bill.staffName,
          status: newBill.status,
          guest_count: bill.guestCount,
          customer_gstin: bill.customerGstin || null,
          hsn_codes: bill.hsnCodes || null,
          place_of_supply: bill.placeOfSupply || null,
          outlet_gstin: bill.outletGSTIN || null,
          is_gst_bill: bill.isGstBill !== false,
          shift_id: bill.shiftId || null,
          staff_id: bill.staffId || null,
          created_at: createdIso,
        }, { onConflict: 'id' }).then(({ error }) => {
          if (error) console.warn('[addBill] Background Supabase sync failed (will retry on next sync):', error.message);
          else console.log('[addBill] Synced to Supabase ✓', bill.invoiceNumber);
        });
      },

  voidBill: async (billId: string, voidedBy: string, voidReason?: string, shiftId?: string) => {
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
    // Server-side pagination: only fetch one page at a time to reduce egress
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('bills')
      .select('id,invoice_number,order_id,table_id,table_number,order_type,items,subtotal,total_gst,cgst_amount,sgst_amount,igst_amount,service_charge,discount_amount,total_amount,payments,staff_name,status,voided_by,voided_at,void_reason,guest_count,customer_gstin,place_of_supply,hsn_codes,is_gst_bill,outlet_gstin,shift_id,staff_id,void_shift_id,revised_by,revised_at,revised_reason,created_at', { count: 'exact' })
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (staffFilter?.staffId && staffFilter?.staffName) {
      query = query.or(`staff_id.eq.${staffFilter.staffId},staff_name.ilike.%${staffFilter.staffName.trim()}%`);
    } else if (staffFilter?.staffId) {
      query = query.eq('staff_id', staffFilter.staffId);
    } else if (staffFilter?.staffName) {
      query = query.ilike('staff_name', `%${staffFilter.staffName.trim()}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error || !data) {
      console.error('Failed to fetch bills:', error);
      return { bills: [], total: 0 };
    }

    const mapped = data.map(mapDbBill);
    return { bills: mapped, total: count ?? 0 };
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

  refreshTodayBills: async () => {
    // Force re-fetch today's bills from Supabase — used by Dashboard Refresh button
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('bills')
      .select('id,invoice_number,order_id,table_id,table_number,order_type,items,subtotal,total_gst,cgst_amount,sgst_amount,igst_amount,service_charge,discount_amount,total_amount,payments,staff_name,status,voided_by,voided_at,void_reason,guest_count,customer_gstin,place_of_supply,hsn_codes,is_gst_bill,outlet_gstin,shift_id,staff_id,void_shift_id,revised_by,revised_at,revised_reason,created_at')
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
    // Fetch past 48 hours of bills on startup so open shifts spanning midnight are fully covered
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 2);
    startDate.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('bills')
      .select('id,invoice_number,order_id,table_id,table_number,order_type,items,subtotal,total_gst,cgst_amount,sgst_amount,igst_amount,service_charge,discount_amount,total_amount,payments,staff_name,status,voided_by,voided_at,void_reason,guest_count,customer_gstin,place_of_supply,hsn_codes,is_gst_bill,outlet_gstin,shift_id,staff_id,void_shift_id,revised_by,revised_at,revised_reason,created_at')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(2000);

    if (!error && data) {
      const dbBills = data.map(mapDbBill);

      // Deduplicate DB bills strictly by primary key ID — NEVER by invoice_number
      // (as multiple valid bills might share a number if a sequence collided, dropping real orders)
      const deduplicatedDbBills = (() => {
        const seenIds = new Set<string>();
        const list: Bill[] = [];
        for (const b of dbBills) {
          if (!seenIds.has(b.id)) {
            seenIds.add(b.id);
            list.push(b);
          }
        }
        return list;
      })();

      // Merge: DB is source of truth, while preserving local-only bills
      set((state) => {
        const existingMap = new Map(state.bills.map((b) => [b.id, b]));
        for (const b of deduplicatedDbBills) {
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
  },

  fetchBillsForShift: async (shiftId: string, staffId?: string, openedAt?: Date, closedAt?: Date) => {
    if (!shiftId) return [];

    try {
      let query = supabase
        .from('bills')
        .select('id,invoice_number,order_id,table_id,table_number,order_type,items,subtotal,total_gst,cgst_amount,sgst_amount,igst_amount,service_charge,discount_amount,total_amount,payments,staff_name,status,voided_by,voided_at,void_reason,guest_count,customer_gstin,place_of_supply,hsn_codes,is_gst_bill,outlet_gstin,shift_id,staff_id,void_shift_id,revised_by,revised_at,revised_reason,created_at');

      if (openedAt) {
        const startIso = (openedAt instanceof Date ? openedAt : new Date(openedAt)).toISOString();
        if (closedAt) {
          const endIso = (closedAt instanceof Date ? closedAt : new Date(closedAt)).toISOString();
          if (staffId) {
            query = query.or(`shift_id.eq.${shiftId},and(staff_id.eq.${staffId},created_at.gte.${startIso},created_at.lte.${endIso})`);
          } else {
            query = query.or(`shift_id.eq.${shiftId},and(created_at.gte.${startIso},created_at.lte.${endIso})`);
          }
        } else {
          if (staffId) {
            query = query.or(`shift_id.eq.${shiftId},and(staff_id.eq.${staffId},created_at.gte.${startIso})`);
          } else {
            query = query.or(`shift_id.eq.${shiftId},and(created_at.gte.${startIso})`);
          }
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
