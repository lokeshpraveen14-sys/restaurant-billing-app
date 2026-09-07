import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Vendor, BankAccount, LedgerTransaction, LedgerAccountType } from '../types';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

interface AccountingState {
  vendors: Vendor[];
  bankAccounts: BankAccount[];
  ledgerTransactions: LedgerTransaction[];

  addVendor: (vendor: Omit<Vendor, 'id' | 'createdAt'>) => Promise<void>;
  updateVendor: (id: string, updates: Partial<Vendor>) => Promise<void>;
  deleteVendor: (id: string) => void;

  addBankAccount: (account: Omit<BankAccount, 'id' | 'createdAt'>) => Promise<void>;
  updateBankAccount: (id: string, updates: Partial<BankAccount>) => Promise<void>;
  deleteBankAccount: (id: string) => void;

  addLedgerTransaction: (transaction: Omit<LedgerTransaction, 'id' | 'createdAt'>) => Promise<void>;
  deleteLedgerTransaction: (id: string) => void;

  initAccountingSync: () => void;
}

export const useAccountingStore = create<AccountingState>()(
  persist(
    (set, get) => ({
      vendors: [],
      bankAccounts: [],
      ledgerTransactions: [],

      addVendor: async (vendorData) => {
        const newVendor: Vendor = {
          ...vendorData,
          id: uuidv4(),
          createdAt: new Date(),
        };
        set((state) => ({ vendors: [...state.vendors, newVendor] }));
        const { error } = await supabase.from('vendors').insert({
          id: newVendor.id,
          name: newVendor.name,
          contact_person: newVendor.contactPerson,
          phone: newVendor.phone,
          email: newVendor.email,
          address: newVendor.address,
          gst_number: newVendor.gstNumber,
          opening_balance: newVendor.openingBalance,
          created_at: newVendor.createdAt.toISOString()
        });
        if (error) console.error('Failed to insert vendor:', error);
      },

      updateVendor: async (id, updates) => {
        set((state) => ({
          vendors: state.vendors.map(v => v.id === id ? { ...v, ...updates } : v)
        }));
        const dbUpdates: Record<string, unknown> = {};
        if (updates.name !== undefined) dbUpdates.name = updates.name;
        if (updates.contactPerson !== undefined) dbUpdates.contact_person = updates.contactPerson;
        if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
        if (updates.email !== undefined) dbUpdates.email = updates.email;
        if (updates.address !== undefined) dbUpdates.address = updates.address;
        if (updates.gstNumber !== undefined) dbUpdates.gst_number = updates.gstNumber;
        if (updates.openingBalance !== undefined) dbUpdates.opening_balance = updates.openingBalance;
        const { error } = await supabase.from('vendors').update(dbUpdates).eq('id', id);
        if (error) console.error('Failed to update vendor:', error);
      },

      deleteVendor: (id) => {
        set((state) => ({ vendors: state.vendors.filter(v => v.id !== id) }));
        supabase.from('vendors').delete().eq('id', id).then(({ error }) => {
          if (error) console.error('Failed to delete vendor:', error);
        });
      },

      addBankAccount: async (accountData) => {
        const newAccount: BankAccount = {
          ...accountData,
          id: uuidv4(),
          createdAt: new Date(),
        };
        set((state) => ({ bankAccounts: [...state.bankAccounts, newAccount] }));
        const { error } = await supabase.from('bank_accounts').insert({
          id: newAccount.id,
          account_name: newAccount.accountName,
          account_number: newAccount.accountNumber,
          bank_name: newAccount.bankName,
          opening_balance: newAccount.openingBalance,
          current_balance: newAccount.currentBalance,
          created_at: newAccount.createdAt.toISOString()
        });
        if (error) console.error('Failed to insert bank account:', error);
      },

      updateBankAccount: async (id, updates) => {
        set((state) => ({
          bankAccounts: state.bankAccounts.map(b => b.id === id ? { ...b, ...updates } : b)
        }));
        const dbUpdates: Record<string, unknown> = {};
        if (updates.accountName !== undefined) dbUpdates.account_name = updates.accountName;
        if (updates.accountNumber !== undefined) dbUpdates.account_number = updates.accountNumber;
        if (updates.bankName !== undefined) dbUpdates.bank_name = updates.bankName;
        if (updates.currentBalance !== undefined) dbUpdates.current_balance = updates.currentBalance;
        if (updates.openingBalance !== undefined) dbUpdates.opening_balance = updates.openingBalance;
        const { error } = await supabase.from('bank_accounts').update(dbUpdates).eq('id', id);
        if (error) console.error('Failed to update bank account:', error);
      },

      deleteBankAccount: (id) => {
        set((state) => ({ bankAccounts: state.bankAccounts.filter(b => b.id !== id) }));
        supabase.from('bank_accounts').delete().eq('id', id).then(({ error }) => {
          if (error) console.error('Failed to delete bank account:', error);
        });
      },

      addLedgerTransaction: async (txData) => {
        const newTx: LedgerTransaction = {
          ...txData,
          id: uuidv4(),
          createdAt: new Date(),
        };
        set((state) => ({ ledgerTransactions: [newTx, ...state.ledgerTransactions] }));
        const { error } = await supabase.from('ledger_transactions').insert({
          id: newTx.id,
          date: newTx.date.toISOString(),
          account_type: newTx.accountType,
          account_id: newTx.accountId,
          transaction_type: newTx.transactionType,
          amount: newTx.amount,
          description: newTx.description,
          reference_id: newTx.referenceId,
          created_at: newTx.createdAt.toISOString()
        });
        if (error) console.error('Failed to insert ledger tx:', error);

        // Update bank balance if applicable
        if (newTx.accountType === 'bank' && newTx.accountId) {
          const bank = get().bankAccounts.find(b => b.id === newTx.accountId);
          if (bank) {
            const diff = newTx.transactionType === 'credit' ? newTx.amount : -newTx.amount;
            get().updateBankAccount(bank.id, { currentBalance: bank.currentBalance + diff });
          }
        }
      },

      deleteLedgerTransaction: (id) => {
        set((state) => ({ ledgerTransactions: state.ledgerTransactions.filter(t => t.id !== id) }));
        supabase.from('ledger_transactions').delete().eq('id', id).then(({ error }) => {
          if (error) console.error('Failed to delete ledger transaction:', error);
        });
      },

      initAccountingSync: async () => {
        const { data: vendorsData, error: vendorsError } = await supabase.from('vendors').select('*');
        if (!vendorsError && vendorsData) {
          set({
            vendors: vendorsData.map(v => ({
              id: v.id,
              name: v.name,
              contactPerson: v.contact_person,
              phone: v.phone,
              email: v.email,
              address: v.address,
              gstNumber: v.gst_number,
              openingBalance: Number(v.opening_balance),
              createdAt: new Date(v.created_at)
            }))
          });
        }

        const { data: banksData, error: banksError } = await supabase.from('bank_accounts').select('*');
        if (!banksError && banksData) {
          set({
            bankAccounts: banksData.map(b => ({
              id: b.id,
              accountName: b.account_name,
              accountNumber: b.account_number,
              bankName: b.bank_name,
              openingBalance: Number(b.opening_balance),
              currentBalance: Number(b.current_balance),
              createdAt: new Date(b.created_at)
            }))
          });
        }

        const { data: txData, error: txError } = await supabase
          .from('ledger_transactions')
          .select('*')
          .order('date', { ascending: false })
          .limit(1000);
        if (!txError && txData) {
          set({
            ledgerTransactions: txData.map(t => ({
              id: t.id,
              date: new Date(t.date),
              accountType: t.account_type as LedgerAccountType,
              accountId: t.account_id,
              transactionType: t.transaction_type,
              amount: Number(t.amount),
              description: t.description,
              referenceId: t.reference_id,
              createdAt: new Date(t.created_at)
            }))
          });
        }
      }
    }),
    { name: 'accounting-storage' }
  )
);
