import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Bill } from '../types';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from './settingsStore';
import { useAccountingStore } from './accountingStore';

interface BillState {
  bills: Bill[];
  addBill: (bill: Bill) => Promise<void>;
  voidBill: (billId: string, voidedBy: string, voidReason?: string) => Promise<void>;
  fetchBillsByDateRange: (startDate: Date, endDate: Date, page?: number, limit?: number) => Promise<{ bills: Bill[]; total: number }>;
  initBillSync: () => void;
}

export const useBillStore = create<BillState>()(
  persist(
    (set, get) => ({
      bills: [],

      addBill: async (bill: Bill) => {
    // Guard: skip if this bill ID is already in local state (prevents double-save on retry)
    if (get().bills.some(b => b.id === bill.id)) {
      console.warn('[addBill] Duplicate bill ID detected, skipping:', bill.id);
      return;
    }

    // Add locally for instant UI update
    const newBill = { ...bill, status: bill.status || 'paid' as const };
    set((state) => ({ bills: [...state.bills, newBill] }));

    // Push to Supabase — use UPSERT (onConflict: id) so retries/refreshes never create duplicate rows
    const { error } = await supabase.from('bills').upsert({
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
      created_at: bill.createdAt.toISOString()
    }, { onConflict: 'id' });

    if (error) {
      console.error('[addBill] Failed to upsert bill into Supabase:', error);
    }
  },


  voidBill: async (billId: string, voidedBy: string, voidReason?: string) => {
    const voidedAt = new Date();
    // Optimistic UI update
    set((state) => ({
      bills: state.bills.map((b) =>
        b.id === billId
          ? { ...b, status: 'void' as const, voidedBy, voidedAt, voidReason: voidReason || '' }
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
      })
      .eq('id', billId);

    if (error) {
      console.error('Failed to void bill in Supabase:', error);
    }
  },

  fetchBillsByDateRange: async (startDate: Date, endDate: Date, page = 1, limit = 50) => {
    // Server-side pagination: only fetch one page at a time to reduce egress
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('bills')
      .select('id,invoice_number,order_id,table_id,table_number,order_type,items,subtotal,total_gst,cgst_amount,sgst_amount,igst_amount,service_charge,discount_amount,total_amount,payments,staff_name,status,guest_count,customer_gstin,place_of_supply,hsn_codes,is_gst_bill,outlet_gstin,created_at', { count: 'exact' })
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error || !data) {
      console.error('Failed to fetch bills:', error);
      return { bills: [], total: 0 };
    }

    const mapped = data.map((b) => ({
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
      status: b.status || 'paid',
      voidedBy: b.voided_by || undefined,
      voidedAt: b.voided_at ? new Date(b.voided_at) : undefined,
      voidReason: b.void_reason || undefined,
      guestCount: b.guest_count,
      customerGstin: b.customer_gstin || undefined,
      placeOfSupply: b.place_of_supply || undefined,
      hsnCodes: b.hsn_codes || undefined,
      isGstBill: b.is_gst_bill !== false,
      createdAt: new Date(b.created_at),
      outletName: '',
      outletAddress: '',
      outletGSTIN: b.outlet_gstin || '',
    }));

    return { bills: mapped, total: count ?? 0 };
  },

  initBillSync: async () => {
    // Fetch only today's bills on startup to minimise egress
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('bills')
      .select('id,invoice_number,order_id,table_id,table_number,order_type,items,subtotal,total_gst,cgst_amount,sgst_amount,igst_amount,service_charge,discount_amount,total_amount,payments,staff_name,status,guest_count,customer_gstin,place_of_supply,hsn_codes,is_gst_bill,outlet_gstin,created_at')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(200);

    if (!error && data) {
      const dbBills = data.map(b => ({
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
        status: b.status || 'paid',
        voidedBy: b.voided_by || undefined,
        voidedAt: b.voided_at ? new Date(b.voided_at) : undefined,
        voidReason: b.void_reason || undefined,
        guestCount: b.guest_count,
        customerGstin: b.customer_gstin || undefined,
        placeOfSupply: b.place_of_supply || undefined,
        hsnCodes: b.hsn_codes || undefined,
        isGstBill: b.is_gst_bill !== false,
        createdAt: new Date(b.created_at),
        outletName: '',
        outletAddress: '',
        outletGSTIN: b.outlet_gstin || '',
      }));

      // Deduplicate DB bills by invoiceNumber — keep the earliest created_at per invoice.
      // This handles the case where the same invoice was accidentally inserted twice in DB.
      const deduplicatedDbBills = (() => {
        const seenInvoices = new Map<string, (typeof dbBills)[0]>();
        for (const b of dbBills) {
          const existing = seenInvoices.get(b.invoiceNumber);
          if (!existing || b.createdAt < existing.createdAt) {
            seenInvoices.set(b.invoiceNumber, b);
          }
        }
        return Array.from(seenInvoices.values());
      })();

      // Merge: DB is authoritative. Keep any local bills not in DB (e.g. just created).
      set((state) => {
        const dbIds = new Set(deduplicatedDbBills.map(b => b.id));
        const dbInvoiceNumbers = new Set(deduplicatedDbBills.map(b => b.invoiceNumber));
        // Exclude local bills whose invoice number is already in DB (prevents showing stale local copies)
        const localOnly = state.bills.filter(
          b => !dbIds.has(b.id) && !dbInvoiceNumbers.has(b.invoiceNumber)
        );
        return { bills: [...deduplicatedDbBills, ...localOnly] };
      });

      // Sync the invoice counter based on the bills we just fetched
      dbBills.forEach(b => useSettingsStore.getState().syncInvoiceCounter(b.invoiceNumber));
    }

    // NOTE: Bills realtime subscription removed to save Supabase realtime quota.
    // New bills are added to local store immediately via addBill(), so cross-device
    // sync for bills isn't needed during active service. BillHistory always re-fetches
    // from Supabase on demand.
  }
    }),
    {
      name: 'bill-storage',
      // We are persisting it so that even if Supabase is missing columns (like guest_count), local state remains
    }
  )
);
