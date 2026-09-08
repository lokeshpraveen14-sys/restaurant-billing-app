import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { StaffDetails, SalaryRecord } from '../types';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { useAccountingStore } from './accountingStore';

interface StaffState {
  staffDetails: StaffDetails[];
  salaryRecords: SalaryRecord[];

  updateStaffDetails: (userId: string, details: Partial<StaffDetails>) => Promise<void>;
  addSalaryRecord: (record: Omit<SalaryRecord, 'id' | 'createdAt'>) => Promise<void>;
  
  initStaffSync: () => void;
}

export const useStaffStore = create<StaffState>()(
  persist(
    (set, get) => ({
      staffDetails: [],
      salaryRecords: [],

      updateStaffDetails: async (userId, details) => {
        set((state) => {
          const existing = state.staffDetails.find(s => s.userId === userId);
          if (existing) {
            return {
              staffDetails: state.staffDetails.map(s => s.userId === userId ? { ...s, ...details } : s)
            };
          } else {
            return {
              staffDetails: [...state.staffDetails, { userId, baseSalary: 0, ...details }]
            };
          }
        });

        const dbUpdates: any = { user_id: userId };
        if (details.baseSalary !== undefined) dbUpdates.base_salary = details.baseSalary;
        if (details.joiningDate !== undefined) dbUpdates.joining_date = details.joiningDate.toISOString();
        if (details.bankAccountNo !== undefined) dbUpdates.bank_account_no = details.bankAccountNo;
        if (details.ifscCode !== undefined) dbUpdates.ifsc_code = details.ifscCode;

        // Upsert
        const { error } = await supabase.from('staff_details').upsert(dbUpdates, { onConflict: 'user_id' });
        if (error) console.error('Failed to update staff details:', error);
      },

      addSalaryRecord: async (recordData) => {
        const newRecord: SalaryRecord = {
          ...recordData,
          id: uuidv4(),
          createdAt: new Date(),
        };

        set((state) => ({ salaryRecords: [...state.salaryRecords, newRecord] }));

        const { error } = await supabase.from('salary_records').insert({
          id: newRecord.id,
          staff_id: newRecord.staffId,
          month: newRecord.month,
          year: newRecord.year,
          amount: newRecord.amount,
          transaction_type: newRecord.transactionType,
          payment_date: newRecord.paymentDate.toISOString(),
          notes: newRecord.notes,
          created_at: newRecord.createdAt.toISOString()
        });
        if (error) {
          console.error('Failed to insert salary record:', error);
          throw new Error('Failed to record salary in database');
        }

        // Also add an accounting daybook entry for salary expense (Payment voucher per spec §9)
        await useAccountingStore.getState().addLedgerTransaction({
          date: newRecord.paymentDate,
          accountType: 'cash',
          voucherType: 'payment',
          transactionType: 'debit',   // Expense increases with Debit (per-account-type rule §4)
          amount: newRecord.amount,
          description: `Payment Voucher — Salary ${newRecord.transactionType === 'advance' ? '(Advance)' : ''} — ${newRecord.month}/${newRecord.year}${newRecord.notes ? ` — ${newRecord.notes}` : ''}`,
          referenceId: newRecord.id
        });
      },

      initStaffSync: async () => {
        const { data: detailsData, error: detailsError } = await supabase.from('staff_details').select('*');
        if (!detailsError && detailsData) {
          set({
            staffDetails: detailsData.map(d => ({
              userId: d.user_id,
              baseSalary: Number(d.base_salary),
              joiningDate: d.joining_date ? new Date(d.joining_date) : undefined,
              bankAccountNo: d.bank_account_no,
              ifscCode: d.ifsc_code
            }))
          });
        }

        const { data: salaryData, error: salaryError } = await supabase
          .from('salary_records')
          .select('*')
          .order('payment_date', { ascending: false });
          
        if (!salaryError && salaryData) {
          set({
            salaryRecords: salaryData.map(s => ({
              id: s.id,
              staffId: s.staff_id,
              month: s.month,
              year: s.year,
              amount: Number(s.amount),
              transactionType: s.transaction_type,
              paymentDate: new Date(s.payment_date),
              notes: s.notes,
              createdAt: new Date(s.created_at)
            }))
          });
        }
      }
    }),
    {
      name: 'staff-storage',
    }
  )
);
