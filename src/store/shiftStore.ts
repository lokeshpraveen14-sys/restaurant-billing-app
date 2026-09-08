import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Shift } from '../types';
import { supabase } from '../lib/supabase';
import { useAccountingStore } from './accountingStore';

interface ShiftState {
  shifts: Shift[];
  currentShift: Shift | null;
  openShift: (staffName: string, staffId: string, openingBalance: number) => Promise<Shift>;
  closeShift: (
    actualClosingBalance: number,
    shiftRevenue: number,
    shiftCash: number,
    shiftUPI: number,
    shiftCard: number,
    notes?: string
  ) => Promise<void>;
  addBillToShift: (cashAmount: number, upiAmount: number, cardAmount: number, total: number, covers: number) => Promise<void>;
  initShiftSync: () => Promise<void>;
}

export const useShiftStore = create<ShiftState>()(
  persist(
    (set, get) => ({
      shifts: [],
      currentShift: null,

      openShift: async (staffName, staffId, openingBalance) => {
        const newShift: Shift = {
          id: crypto.randomUUID(),
          staffName,
          staffId,
          openedAt: new Date(),
          openingBalance,
          totalCash: 0,
          totalUPI: 0,
          totalCard: 0,
          totalRevenue: 0,
          totalOrders: 0,
          totalCovers: 0,
          status: 'open',
        };
        set({ currentShift: newShift });
        
        await supabase.from('shifts').insert({
          id: newShift.id,
          staff_name: newShift.staffName,
          staff_id: newShift.staffId,
          opened_at: newShift.openedAt.toISOString(),
          opening_balance: newShift.openingBalance,
          status: newShift.status
        });
        
        return newShift;
      },

      closeShift: async (
        actualClosingBalance: number,
        shiftRevenue: number,
        shiftCash: number,
        shiftUPI: number,
        shiftCard: number,
        notes?: string
      ) => {
        const current = get().currentShift;
        if (!current) return;

        // Expected closing = opening + dynamically calculated cash
        const expectedClosingBalance = current.openingBalance + shiftCash;
        const variance = actualClosingBalance - expectedClosingBalance;

        const closed: Shift = {
          ...current,
          closedAt: new Date(),
          totalRevenue: shiftRevenue,
          totalCash: shiftCash,
          totalUPI: shiftUPI,
          totalCard: shiftCard,
          expectedClosingBalance,
          actualClosingBalance,
          variance,
          status: 'closed',
          notes,
        };

        const { error } = await supabase.from('shifts').update({
          closed_at: closed.closedAt!.toISOString(),
          total_revenue: shiftRevenue,
          total_cash: shiftCash,
          total_upi: shiftUPI,
          total_card: shiftCard,
          closing_balance: actualClosingBalance,
          status: 'closed',
          notes,
        }).eq('id', closed.id);

        if (error) {
          console.error('Failed to close shift in Supabase:', error);
          return;
        }

        set({
          currentShift: null,
          shifts: [closed, ...get().shifts],
        });

        // === SPEC §8: Post shift cash variance as Journal voucher ===
        if (variance !== 0) {
          const isShort = variance < 0;
          await useAccountingStore.getState().addLedgerTransaction({
            date: new Date(),
            accountType: 'cash',
            voucherType: 'journal',
            transactionType: isShort ? 'debit' : 'credit',
            amount: Math.abs(variance),
            description: isShort
              ? `Journal — Cash Short on shift close (${current.staffName})`
              : `Journal — Cash Over on shift close (${current.staffName})`,
            referenceId: closed.id,
          });
        }

        // === NEW FEATURE: Consolidated Sales/Receipt Posting per Shift ===
        if (shiftRevenue > 0) {
          const dt = new Date();
          // 1. Consolidated Sales (Credit Revenue)
          await useAccountingStore.getState().addLedgerTransaction({
            date: dt,
            accountType: 'cash',
            voucherType: 'sales',
            transactionType: 'credit',
            amount: shiftRevenue,
            description: `Sales — Shift Consolidated (${current.staffName})`,
            referenceId: closed.id,
          });

          // 2. Consolidated Receipts (Debit Assets)
          if (shiftCash > 0) {
            await useAccountingStore.getState().addLedgerTransaction({
              date: dt,
              accountType: 'cash',
              voucherType: 'receipt',
              transactionType: 'debit',
              amount: shiftCash,
              description: `Receipt — Shift Consolidated (Cash)`,
              referenceId: closed.id,
            });
          }
          if (shiftUPI > 0) {
            await useAccountingStore.getState().addLedgerTransaction({
              date: dt,
              accountType: 'bank',
              voucherType: 'receipt',
              transactionType: 'debit',
              amount: shiftUPI,
              description: `Receipt — Shift Consolidated (UPI)`,
              referenceId: closed.id,
            });
          }
          if (shiftCard > 0) {
            await useAccountingStore.getState().addLedgerTransaction({
              date: dt,
              accountType: 'bank',
              voucherType: 'receipt',
              transactionType: 'debit',
              amount: shiftCard,
              description: `Receipt — Shift Consolidated (Card)`,
              referenceId: closed.id,
            });
          }
        }
      },

      addBillToShift: async (cashAmount, upiAmount, cardAmount, total, covers) => {
        const current = get().currentShift;
        if (!current) return;
        
        const updatedShift = {
          ...current,
          totalCash: current.totalCash + cashAmount,
          totalUPI: current.totalUPI + upiAmount,
          totalCard: current.totalCard + cardAmount,
          totalRevenue: current.totalRevenue + total,
          totalOrders: current.totalOrders + 1,
          totalCovers: current.totalCovers + covers,
        };
        
        set({ currentShift: updatedShift });
        
        supabase.from('shifts').update({
          total_cash: updatedShift.totalCash,
          total_upi: updatedShift.totalUPI,
          total_card: updatedShift.totalCard,
          total_revenue: updatedShift.totalRevenue,
          total_orders: updatedShift.totalOrders,
          total_covers: updatedShift.totalCovers
        }).eq('id', updatedShift.id).then();
      },
      
      initShiftSync: async () => {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);

        const { data, error } = await supabase
          .from('shifts')
          .select('*')
          .gte('opened_at', startDate.toISOString())
          .order('opened_at', { ascending: false });

        if (!error && data) {
          const dbShifts = data.map(s => ({
            id: s.id,
            staffName: s.staff_name,
            staffId: s.staff_id,
            openedAt: new Date(s.opened_at),
            closedAt: s.closed_at ? new Date(s.closed_at) : undefined,
            openingBalance: Number(s.opening_balance),
            closingBalance: s.closing_balance ? Number(s.closing_balance) : undefined,
            totalCash: Number(s.total_cash),
            totalUPI: Number(s.total_upi),
            totalCard: Number(s.total_card),
            totalRevenue: Number(s.total_revenue),
            totalOrders: Number(s.total_orders),
            totalCovers: Number(s.total_covers),
            notes: s.notes,
            status: s.status as 'open' | 'closed'
          }));
          
          const openShift = dbShifts.find(s => s.status === 'open') || null;
          set({ shifts: dbShifts.filter(s => s.status === 'closed'), currentShift: openShift });
        }
      },
    }),
    { name: 'restaurant-shifts' }
  )
);
