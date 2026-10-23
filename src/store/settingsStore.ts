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
  invoicePrefix: 'TX',
  invoiceCounter: 1,
  outlet: 'Main Branch',
  currency: 'INR',
  // GST Settings
  gstEnabled: true,
  defaultGstRate: 5,
  categoryGstRates: {},
  businessState: 'Tamil Nadu', // default — update in Settings page for your location
};

interface SettingsState {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => void;
  incrementInvoiceCounter: () => number;
  syncInvoiceCounter: (invoiceNumber: string) => void;
  syncPrintersToCloud: () => Promise<void>;
  syncRestaurantSettingsToCloud: () => Promise<void>;
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
        let counter = 0;
        set((state) => {
          // If local counter was corrupted to > 999,999, reset to 1
          const safeCounter = (state.settings.invoiceCounter > 999999) ? 1 : state.settings.invoiceCounter;
          counter = safeCounter;
          return { settings: { ...state.settings, invoiceCounter: safeCounter + 1 } };
        });
        return counter;
      },

      syncInvoiceCounter: (invoiceNumber: string) => {
        if (!invoiceNumber || typeof invoiceNumber !== 'string') return;
        const currentPrefix = get().settings.invoicePrefix;
        // Strictly only sync counters for the CURRENT prefix (e.g. "TX/")
        // NEVER let old "INV/" numbers contaminate the active counter
        if (!invoiceNumber.startsWith(currentPrefix + '/')) return;

        // Strictly only match pure 1-6 digit numbers (ignore any corrupted 8-digit numbers)
        const parts = invoiceNumber.split('/');
        const seqPart = parts[parts.length - 1];
        if (!seqPart || !/^\d{1,6}$/.test(seqPart)) return;

        const counter = parseInt(seqPart, 10);
        if (!isNaN(counter)) {
          set((state) => {
            const currentLocal = (state.settings.invoiceCounter > 999999) ? 1 : state.settings.invoiceCounter;
            if (counter >= currentLocal) {
              return { settings: { ...state.settings, invoiceCounter: counter + 1 } };
            }
            return state.settings.invoiceCounter > 999999 ? { settings: { ...state.settings, invoiceCounter: currentLocal } } : state;
          });
        }
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

      syncRestaurantSettingsToCloud: async () => {
        const s = get().settings;
        try {
          const { error } = await supabase.from('app_settings').upsert({
            id: 'default',
            restaurant_info: {
              restaurantName: s.restaurantName,
              address: s.address,
              phone: s.phone,
              email: s.email,
              gstin: s.gstin,
              upiId: s.upiId,
              outlet: s.outlet,
              currency: s.currency,
              financialYear: s.financialYear,
              invoicePrefix: s.invoicePrefix,
              serviceChargePercent: s.serviceChargePercent,
              serviceChargeEnabled: s.serviceChargeEnabled,
              parcelCharge: s.parcelCharge,
              parcelChargeEnabled: s.parcelChargeEnabled,
              gstEnabled: s.gstEnabled,
              defaultGstRate: s.defaultGstRate,
              businessState: s.businessState,
              categoryGstRates: s.categoryGstRates,
              logoUrl: s.logoUrl,
              printerWidth: s.printerWidth,
              autoPrintBill: s.autoPrintBill,
              autoPrintKot: s.autoPrintKot,
            },
            updated_at: new Date().toISOString(),
          });
          if (error) console.error('Failed to sync restaurant settings to cloud:', error);
          else console.log('[Settings] Restaurant info synced to cloud ✓');
        } catch (e) {
          console.error('Restaurant settings cloud sync error:', e);
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

        // Fetch restaurant info from cloud on startup
        (async () => {
          try {
            const { data, error } = await supabase
              .from('app_settings')
              .select('restaurant_info')
              .eq('id', 'default')
              .single();
            if (!error && data?.restaurant_info) {
              const ri = data.restaurant_info as Partial<Settings>;
              set((state) => ({ settings: { ...state.settings, ...ri } }));
              console.log('[Settings] Restaurant info loaded from cloud ✓');
            }
          } catch (e) {
            console.warn('[Settings] Could not fetch restaurant info from cloud:', e);
          }
        })();
        // Subscribe to real-time printer config changes from other devices
        const existing = supabase.getChannels().find(c => c.topic === 'realtime:public:app_settings');
        if (existing) return;

        // Upgrade legacy 'INV' or 'BILL' series to clean 'TX' series
        if (get().settings.invoicePrefix === 'INV' || get().settings.invoicePrefix === 'BILL') {
          set((state) => ({ settings: { ...state.settings, invoicePrefix: 'TX' } }));
        }

        supabase
          .channel('public:app_settings')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload) => {
            const row = payload.new as any;
            if (!row) return;

            set((state) => {
              let newSettings = { ...state.settings };
              
              if (row.printers && Array.isArray(row.printers)) {
                newSettings.printers = row.printers;
              }
              
              if (row.restaurant_info) {
                newSettings = { ...newSettings, ...row.restaurant_info };
              }
              
              return { settings: newSettings };
            });
          })
          .subscribe();
      },
    }),
    { name: 'railway-coach-settings' }
  )
);
