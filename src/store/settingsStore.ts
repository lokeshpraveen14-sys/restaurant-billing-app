import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Settings } from '../types';

const DEFAULT_SETTINGS: Settings = {
  restaurantName: 'Railway Coach Kerala Restaurant',
  address: 'Ayothipattinam',
  phone: '+91 98765 43210',
  email: 'info@railway.com',
  gstin: '33AABCU9603R1ZX',
  serviceChargePercent: 5,
  serviceChargeEnabled: false,
  parcelCharge: 20,
  parcelChargeEnabled: false,
  printerWidth: '80mm',
  // Printer profiles – add one per counter
  printers: [],
  autoPrintBill: false,
  autoPrintKot: false,
  upiId: 'railway@upi',
  financialYear: '2025-26',
  invoicePrefix: 'INV',
  invoiceCounter: 1,
  outlet: 'Main Branch',
  currency: 'INR',
  // GST Settings
  gstEnabled: true,
  defaultGstRate: 5,
  categoryGstRates: {},
};

interface SettingsState {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => void;
  incrementInvoiceCounter: () => number;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,

      updateSettings: (updates) =>
        set((state) => ({ settings: { ...state.settings, ...updates } })),

      incrementInvoiceCounter: () => {
        const current = get().settings.invoiceCounter;
        set((state) => ({
          settings: { ...state.settings, invoiceCounter: state.settings.invoiceCounter + 1 },
        }));
        return current;
      },
    }),
    { name: 'railway-coach-settings' }
  )
);
