import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Bill } from '../types';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from './settingsStore';

interface BillState {
  bills: Bill[];
  addBill: (bill: Bill) => Promise<void>;
  voidBill: (billId: string) => Promise<void>;
  fetchBillsByDateRange: (startDate: Date, endDate: Date) => Promise<Bill[]>;
  initBillSync: () => void;
}

export const useBillStore = create<BillState>()(
  persist(
    (set, get) => ({
      bills: [],

      addBill: async (bill: Bill) => {
    // Add locally for instant UI update
    const newBill = { ...bill, status: bill.status || 'paid' as const };
    set((state) => ({ bills: [...state.bills, newBill] }));

    // Push to Supabase
    const { error } = await supabase.from('bills').insert({
      id: bill.id,
      invoice_number: bill.invoiceNumber,
      order_id: bill.orderId,
      table_id: bill.tableId || null,
      table_number: bill.tableNumber || null,
      order_type: bill.orderType,
      items: bill.items,
      subtotal: bill.subtotal,
      total_gst: bill.totalGST,
      service_charge: bill.serviceCharge,
      discount_amount: bill.discountAmount,
      total_amount: bill.totalAmount,
      payments: bill.payments,
      staff_name: bill.staffName,
      status: newBill.status,
      guest_count: bill.guestCount,
      created_at: bill.createdAt.toISOString()
    });

    if (error) {
      console.error('Failed to insert bill into Supabase:', error);
      // Fallback: If table doesn't exist, we should at least warn them
    }
  },

  voidBill: async (billId: string) => {
    // Optimistic UI update
    set((state) => ({
      bills: state.bills.map((b) => (b.id === billId ? { ...b, status: 'void' as const } : b)),
    }));

    // Update in Supabase
    const { error } = await supabase
      .from('bills')
      .update({ status: 'void' })
      .eq('id', billId);

    if (error) {
      console.error('Failed to void bill in Supabase:', error);
    }
  },

  fetchBillsByDateRange: async (startDate: Date, endDate: Date) => {
    const { data, error } = await supabase
      .from('bills')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error || !data) {
      console.error('Failed to fetch bills:', error);
      return [];
    }

    return data.map((b) => ({
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
      guestCount: b.guest_count,
      createdAt: new Date(b.created_at),
      outletName: '',
      outletAddress: '',
      outletGSTIN: '',
    }));
  },

  initBillSync: async () => {
    // Fetch recent bills initially so dashboard populates correctly
    // Limit to 3 days to prevent massive payloads and 1000 row limits cutting off today's bills
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 3);
    startDate.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('bills')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

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
        guestCount: b.guest_count,
        createdAt: new Date(b.created_at),
        outletName: '',
        outletAddress: '',
        outletGSTIN: '',
      }));

      // Merge: DB is authoritative. Keep any local bills not in DB (e.g. just created).
      set((state) => {
        const dbIds = new Set(dbBills.map(b => b.id));
        const localOnly = state.bills.filter(b => !dbIds.has(b.id));
        return { bills: [...dbBills, ...localOnly] };
      });

      // Sync the invoice counter based on the bills we just fetched
      dbBills.forEach(b => useSettingsStore.getState().syncInvoiceCounter(b.invoiceNumber));
    }

    // Real-time subscription for bills
    supabase.channel('public:bills')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bills' }, payload => {
        const b = payload.new;
        set((state) => {
          // Avoid duplicate insert if we created it locally
          if (state.bills.some(existing => existing.id === b.id)) return state;

          const mappedBill = {
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
            guestCount: b.guest_count,
            createdAt: new Date(b.created_at),
            outletName: '',
            outletAddress: '',
            outletGSTIN: '',
          };
          return { bills: [...state.bills, mappedBill] };
        });

        // Sync invoice counter for new incoming bills
        useSettingsStore.getState().syncInvoiceCounter(b.invoice_number);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bills' }, payload => {
        const b = payload.new;
        set((state) => ({
          bills: state.bills.map((bill) => bill.id === b.id ? { ...bill, status: b.status } : bill)
        }));
      })
      .subscribe();
  }
    }),
    {
      name: 'bill-storage',
      // We are persisting it so that even if Supabase is missing columns (like guest_count), local state remains
    }
  )
);
