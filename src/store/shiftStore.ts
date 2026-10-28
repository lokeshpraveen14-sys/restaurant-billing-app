import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Shift, Bill } from '../types';
import { supabase } from '../lib/supabase';
import { useAccountingStore } from './accountingStore';
import { useAuthStore } from './authStore';

interface ShiftState {
  shifts: Shift[]; // Closed historical shifts
  activeShifts: Shift[]; // All currently open shifts across all cashiers
  currentShift: Shift | null; // Open shift for the currently logged-in user / active context

  getActiveShiftForStaff: (staffId?: string) => Shift | undefined;
  syncCurrentShiftForUser: (staffId?: string) => void;
  openShift: (staffName: string, staffId: string, openingBalance: number) => Promise<Shift>;
  closeShift: (
    shiftIdOrActualClosing: string | number,
    actualClosingBalanceOrRev?: number,
    shiftRevenueOrCash?: number,
    shiftCashOrUPI?: number,
    shiftUPIOrCard?: number,
    shiftCardOrNotes?: number | string,
    notes?: string
  ) => Promise<void>;
  addBillToShift: (
    cashAmount: number,
    upiAmount: number,
    cardAmount: number,
    total: number,
    covers: number,
    staffId?: string,
    shiftId?: string
  ) => Promise<void>;
  voidBillInShift: (bill: Partial<Bill>, targetShiftId?: string) => Promise<void>;
  recalculateShiftTotals: (shiftId: string, shiftBills: Bill[]) => Promise<void>;
  initShiftSync: () => Promise<void>;
}

export const useShiftStore = create<ShiftState>()(
  persist(
    (set, get) => ({
      shifts: [],
      activeShifts: [],
      currentShift: null,

      getActiveShiftForStaff: (staffId?: string) => {
        if (!staffId) return undefined;
        return get().activeShifts.find((s) => s.staffId === staffId && s.status === 'open');
      },

      syncCurrentShiftForUser: (staffId?: string) => {
        const id = staffId || useAuthStore.getState().currentUser?.id;
        if (!id) return;
        const matchingShift = get().activeShifts.find((s) => s.staffId === id && s.status === 'open') || null;
        set({ currentShift: matchingShift });
      },

      openShift: async (staffName, staffId, openingBalance) => {
        // Prevent opening duplicate active shifts for the same staff member
        const existing = get().activeShifts.find((s) => s.staffId === staffId && s.status === 'open');
        if (existing) {
          set({ currentShift: existing });
          return existing;
        }

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

        set((state) => ({
          activeShifts: [...state.activeShifts.filter((s) => s.id !== newShift.id), newShift],
          currentShift: newShift,
        }));

        await supabase.from('shifts').insert({
          id: newShift.id,
          staff_name: newShift.staffName,
          staff_id: newShift.staffId,
          opened_at: newShift.openedAt.toISOString(),
          opening_balance: newShift.openingBalance,
          status: newShift.status,
          total_cash: 0,
          total_upi: 0,
          total_card: 0,
          total_revenue: 0,
          total_orders: 0,
          total_covers: 0,
        });

        return newShift;
      },

      closeShift: async (
        shiftIdOrActualClosing: string | number,
        actualClosingBalanceOrRev?: number,
        shiftRevenueOrCash?: number,
        shiftCashOrUPI?: number,
        shiftUPIOrCard?: number,
        shiftCardOrNotes?: number | string,
        notesParam?: string
      ) => {
        let shiftId: string;
        let actualClosingBalance: number;
        let shiftRevenue: number;
        let shiftCash: number;
        let shiftUPI: number;
        let shiftCard: number;
        let notes: string | undefined;

        if (typeof shiftIdOrActualClosing === 'string') {
          shiftId = shiftIdOrActualClosing;
          actualClosingBalance = actualClosingBalanceOrRev ?? 0;
          shiftRevenue = shiftRevenueOrCash ?? 0;
          shiftCash = shiftCashOrUPI ?? 0;
          shiftUPI = shiftUPIOrCard ?? 0;
          shiftCard = typeof shiftCardOrNotes === 'number' ? shiftCardOrNotes : 0;
          notes = notesParam;
        } else {
          // Backward-compatible fallback when called as closeShift(actualClosingBalance, revenue, cash, upi, card, notes)
          const target = get().currentShift || get().activeShifts[0];
          if (!target) return;
          shiftId = target.id;
          actualClosingBalance = shiftIdOrActualClosing;
          shiftRevenue = actualClosingBalanceOrRev ?? 0;
          shiftCash = shiftRevenueOrCash ?? 0;
          shiftUPI = shiftCashOrUPI ?? 0;
          shiftCard = typeof shiftUPIOrCard === 'number' ? shiftUPIOrCard : 0;
          notes = typeof shiftCardOrNotes === 'string' ? shiftCardOrNotes : notesParam;
        }

        const targetShift =
          get().activeShifts.find((s) => s.id === shiftId) ||
          get().currentShift;

        if (!targetShift) return;

        // Expected closing = opening + dynamically calculated cash
        const expectedClosingBalance = targetShift.openingBalance + shiftCash;
        const variance = actualClosingBalance - expectedClosingBalance;

        const closed: Shift = {
          ...targetShift,
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

        const { error } = await supabase
          .from('shifts')
          .update({
            closed_at: closed.closedAt!.toISOString(),
            total_revenue: shiftRevenue,
            total_cash: shiftCash,
            total_upi: shiftUPI,
            total_card: shiftCard,
            closing_balance: actualClosingBalance,
            status: 'closed',
            notes,
          })
          .eq('id', closed.id);

        if (error) {
          console.error('Failed to close shift in Supabase:', error);
          return;
        }

        set((state) => {
          const remainingActive = state.activeShifts.filter((s) => s.id !== closed.id);
          const currentUser = useAuthStore.getState().currentUser;
          const updatedCurrent =
            state.currentShift?.id === closed.id
              ? currentUser
                ? remainingActive.find((s) => s.staffId === currentUser.id) || null
                : remainingActive[0] || null
              : state.currentShift;

          return {
            activeShifts: remainingActive,
            currentShift: updatedCurrent,
            shifts: [closed, ...state.shifts.filter((s) => s.id !== closed.id)],
          };
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
              ? `Journal — Cash Short on shift close (${targetShift.staffName})`
              : `Journal — Cash Over on shift close (${targetShift.staffName})`,
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
            description: `Sales — Shift Consolidated (${targetShift.staffName})`,
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

      addBillToShift: async (cashAmount, upiAmount, cardAmount, total, covers, staffId, shiftId) => {
        const state = get();
        // Priority 1: Direct shiftId match
        // Priority 2: staffId match among activeShifts
        // Priority 3: currentShift
        // Priority 4: first open active shift
        const target =
          (shiftId ? state.activeShifts.find((s) => s.id === shiftId && s.status === 'open') : null) ||
          (staffId ? state.activeShifts.find((s) => s.staffId === staffId && s.status === 'open') : null) ||
          state.currentShift ||
          state.activeShifts[0];

        if (!target) return;

        const updatedShift: Shift = {
          ...target,
          totalCash: (target.totalCash || 0) + cashAmount,
          totalUPI: (target.totalUPI || 0) + upiAmount,
          totalCard: (target.totalCard || 0) + cardAmount,
          totalRevenue: (target.totalRevenue || 0) + total,
          totalOrders: (target.totalOrders || 0) + 1,
          totalCovers: (target.totalCovers || 0) + covers,
        };

        set((s) => ({
          activeShifts: s.activeShifts.map((sh) => (sh.id === updatedShift.id ? updatedShift : sh)),
          currentShift: s.currentShift?.id === updatedShift.id ? updatedShift : s.currentShift,
        }));

        supabase
          .from('shifts')
          .update({
            total_cash: updatedShift.totalCash,
            total_upi: updatedShift.totalUPI,
            total_card: updatedShift.totalCard,
            total_revenue: updatedShift.totalRevenue,
            total_orders: updatedShift.totalOrders,
            total_covers: updatedShift.totalCovers,
          })
          .eq('id', updatedShift.id)
          .then();
      },

      voidBillInShift: async (bill: Partial<Bill>, targetShiftId?: string) => {
        const state = get();
        const shiftId = targetShiftId || bill.shiftId || bill.voidShiftId;
        const target =
          (shiftId ? state.activeShifts.find((s) => s.id === shiftId && s.status === 'open') : null) ||
          (bill.staffId ? state.activeShifts.find((s) => s.staffId === bill.staffId && s.status === 'open') : null) ||
          (state.currentShift?.status === 'open' ? state.currentShift : null) ||
          state.activeShifts[0];

        if (!target) return;

        const cashAmount = (bill.payments || [])
          .filter((p) => p.mode === 'cash')
          .reduce((sum, p) => sum + p.amount, 0);
        const upiAmount = (bill.payments || [])
          .filter((p) => p.mode === 'upi')
          .reduce((sum, p) => sum + p.amount, 0);
        const cardAmount = (bill.payments || [])
          .filter((p) => p.mode === 'card')
          .reduce((sum, p) => sum + p.amount, 0);
        const total = bill.totalAmount || 0;
        const covers = bill.guestCount || 0;

        const updatedShift: Shift = {
          ...target,
          totalCash: Math.max(0, (target.totalCash || 0) - cashAmount),
          totalUPI: Math.max(0, (target.totalUPI || 0) - upiAmount),
          totalCard: Math.max(0, (target.totalCard || 0) - cardAmount),
          totalRevenue: Math.max(0, (target.totalRevenue || 0) - total),
          totalOrders: Math.max(0, (target.totalOrders || 0) - 1),
          totalCovers: Math.max(0, (target.totalCovers || 0) - covers),
        };

        set((s) => ({
          activeShifts: s.activeShifts.map((sh) => (sh.id === updatedShift.id ? updatedShift : sh)),
          currentShift: s.currentShift?.id === updatedShift.id ? updatedShift : s.currentShift,
        }));

        try {
          await supabase
            .from('shifts')
            .update({
              total_cash: updatedShift.totalCash,
              total_upi: updatedShift.totalUPI,
              total_card: updatedShift.totalCard,
              total_revenue: updatedShift.totalRevenue,
              total_orders: updatedShift.totalOrders,
              total_covers: updatedShift.totalCovers,
            })
            .eq('id', updatedShift.id);
        } catch (err) {
          console.error('Failed to update shift after voiding bill in Supabase:', err);
        }
      },

      recalculateShiftTotals: async (shiftId: string, shiftBills: Bill[]) => {
        const state = get();
        const target =
          state.activeShifts.find((s) => s.id === shiftId) ||
          (state.currentShift?.id === shiftId ? state.currentShift : null);

        if (!target) return;

        // Paid bills only (exclude voided and revised bills)
        const paidBills = shiftBills.filter((b) => b.status === 'paid' || !b.status);

        const totalCash = paidBills.reduce(
          (s, b) =>
            s + (b.payments || []).filter((p) => p.mode === 'cash').reduce((a, p) => a + p.amount, 0),
          0
        );
        const totalUPI = paidBills.reduce(
          (s, b) =>
            s + (b.payments || []).filter((p) => p.mode === 'upi').reduce((a, p) => a + p.amount, 0),
          0
        );
        const totalCard = paidBills.reduce(
          (s, b) =>
            s + (b.payments || []).filter((p) => p.mode === 'card').reduce((a, p) => a + p.amount, 0),
          0
        );
        const totalRevenue = paidBills.reduce((s, b) => s + (b.totalAmount || 0), 0);
        const totalCovers = paidBills.reduce((s, b) => s + (b.guestCount || 0), 0);
        const totalOrders = paidBills.length;

        // Guard: if totals are already identical, do not trigger state update or DB write
        const isUnchanged =
          (target.totalCash || 0) === totalCash &&
          (target.totalUPI || 0) === totalUPI &&
          (target.totalCard || 0) === totalCard &&
          (target.totalRevenue || 0) === totalRevenue &&
          (target.totalOrders || 0) === totalOrders &&
          (target.totalCovers || 0) === totalCovers;

        if (isUnchanged) return;

        const updatedShift: Shift = {
          ...target,
          totalCash,
          totalUPI,
          totalCard,
          totalRevenue,
          totalOrders,
          totalCovers,
        };

        set((s) => ({
          activeShifts: s.activeShifts.map((sh) => (sh.id === updatedShift.id ? updatedShift : sh)),
          currentShift: s.currentShift?.id === updatedShift.id ? updatedShift : s.currentShift,
        }));

        try {
          await supabase
            .from('shifts')
            .update({
              total_cash: totalCash,
              total_upi: totalUPI,
              total_card: totalCard,
              total_revenue: totalRevenue,
              total_orders: totalOrders,
              total_covers: totalCovers,
            })
            .eq('id', updatedShift.id);
        } catch (err) {
          console.error('Failed to update recalculated shift totals in Supabase:', err);
        }
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
          const dbShifts: Shift[] = data.map((s) => ({
            id: s.id,
            staffName: s.staff_name,
            staffId: s.staff_id,
            openedAt: new Date(s.opened_at),
            closedAt: s.closed_at ? new Date(s.closed_at) : undefined,
            openingBalance: Number(s.opening_balance || 0),
            closingBalance: s.closing_balance ? Number(s.closing_balance) : undefined,
            actualClosingBalance: s.closing_balance ? Number(s.closing_balance) : undefined,
            expectedClosingBalance: s.closing_balance ? Number(s.closing_balance) : undefined,
            totalCash: Number(s.total_cash || 0),
            totalUPI: Number(s.total_upi || 0),
            totalCard: Number(s.total_card || 0),
            totalRevenue: Number(s.total_revenue || 0),
            totalOrders: Number(s.total_orders || 0),
            totalCovers: Number(s.total_covers || 0),
            notes: s.notes,
            status: s.status as 'open' | 'closed',
          }));

          const activeShifts = dbShifts.filter((s) => s.status === 'open');
          const closedShifts = dbShifts.filter((s) => s.status === 'closed');

          const currentUser = useAuthStore.getState().currentUser;
          const userShift = currentUser
            ? activeShifts.find((s) => s.staffId === currentUser.id) || null
            : null;

          set({
            shifts: closedShifts,
            activeShifts,
            currentShift: userShift || activeShifts[0] || null,
          });
        }

        // Realtime sync on shifts so all 3-4 cashier terminals see open/closed shifts immediately
        const staleChannel = supabase.getChannels().find((c) => c.topic === 'realtime:shifts-realtime-sync');
        if (staleChannel) supabase.removeChannel(staleChannel);

        supabase
          .channel('shifts-realtime-sync')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, (payload) => {
            const { eventType, new: newRow, old: oldRow } = payload as any;
            if (eventType === 'DELETE') {
              set((state) => ({
                activeShifts: state.activeShifts.filter((s) => s.id !== oldRow.id),
                shifts: state.shifts.filter((s) => s.id !== oldRow.id),
                currentShift: state.currentShift?.id === oldRow.id ? null : state.currentShift,
              }));
              return;
            }

            const mapped: Shift = {
              id: newRow.id,
              staffName: newRow.staff_name,
              staffId: newRow.staff_id,
              openedAt: new Date(newRow.opened_at),
              closedAt: newRow.closed_at ? new Date(newRow.closed_at) : undefined,
              openingBalance: Number(newRow.opening_balance || 0),
              closingBalance: newRow.closing_balance ? Number(newRow.closing_balance) : undefined,
              actualClosingBalance: newRow.closing_balance ? Number(newRow.closing_balance) : undefined,
              totalCash: Number(newRow.total_cash || 0),
              totalUPI: Number(newRow.total_upi || 0),
              totalCard: Number(newRow.total_card || 0),
              totalRevenue: Number(newRow.total_revenue || 0),
              totalOrders: Number(newRow.total_orders || 0),
              totalCovers: Number(newRow.total_covers || 0),
              notes: newRow.notes,
              status: newRow.status as 'open' | 'closed',
            };

            set((state) => {
              let newActive = state.activeShifts;
              let newClosed = state.shifts;

              if (mapped.status === 'open') {
                newActive = [mapped, ...state.activeShifts.filter((s) => s.id !== mapped.id)];
                newClosed = state.shifts.filter((s) => s.id !== mapped.id);
              } else {
                newActive = state.activeShifts.filter((s) => s.id !== mapped.id);
                newClosed = [mapped, ...state.shifts.filter((s) => s.id !== mapped.id)];
              }

              const currentUser = useAuthStore.getState().currentUser;
              const updatedCurrent = currentUser
                ? newActive.find((s) => s.staffId === currentUser.id) || null
                : newActive[0] || null;

              return {
                activeShifts: newActive,
                shifts: newClosed,
                currentShift: updatedCurrent,
              };
            });
          })
          .subscribe();
      },
    }),
    {
      name: 'restaurant-shifts',
      partialize: (state) => ({
        shifts: state.shifts,
        activeShifts: state.activeShifts,
      }),
    }
  )
);
