import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Settings } from '../types';
import { supabase } from '../lib/supabase';

const DEFAULT_SETTINGS: Settings = {
  restaurantName: 'Railway Coach Kerala Restaurant',
  address: 'Ayothipattinam',
  phone: '',
  email: '',
  gstin: '',
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
  syncPrintersToCloud: () => Promise<void>;
  fetchPrintersFromCloud: () => Promise<void>;
  initSettingsSync: () => void;
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

      syncPrintersToCloud: async () => {
        const { printers } = get().settings;
        try {
          const { error } = await supabase.from('app_settings').upsert({
            id: 'default',
            printers: printers,
            updated_at: new Date().toISOString(),
          });
          if (error) console.error('Failed to sync printers to cloud:', error);
        } catch (e) {
          console.error('Printer cloud sync error:', e);
        }
      },

      fetchPrintersFromCloud: async () => {
        try {
          const { data, error } = await supabase
            .from('app_settings')
            .select('printers')
            .eq('id', 'default')
            .single();

          if (!error && data?.printers && Array.isArray(data.printers) && data.printers.length > 0) {
            set((state) => ({
              settings: { ...state.settings, printers: data.printers },
            }));
          }
        } catch (e) {
          console.error('Failed to fetch printers from cloud:', e);
        }
      },

      initSettingsSync: () => {
        // Fetch shared printer config from cloud on startup
        get().fetchPrintersFromCloud();

        // Subscribe to real-time printer config changes from other devices
        const existing = supabase.getChannels().find(c => c.topic === 'realtime:public:app_settings');
        if (existing) return;

        supabase.channel('public:app_settings')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload) => {
            const printers = (payload.new as any)?.printers;
            if (printers && Array.isArray(printers)) {
              set((state) => ({
                settings: { ...state.settings, printers },
              }));
            }
          })
          .subscribe();
      },
    }),
    { name: 'railway-coach-settings' }
  )
);
