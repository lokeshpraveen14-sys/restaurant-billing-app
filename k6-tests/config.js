// Shared configuration for k6 tests
export const BASE_URL = 'https://czflketsnfyicpnfjfrb.supabase.co';
export const ANON_KEY = 'sb_publishable_cLKyR5xgBQtajm4HfPHwgw_WBcFxx2F';

export const TEST_TAGS = {
  staff_name: 'K6_LOAD_TEST',
  staff_id: 'k6-staff-pos-test',
  customer_name: 'K6_TEST_DELETE',
  customer_phone: '9999900000',
  table_number: 'T-K6-TEST',
  invoice_prefix: 'INV-K6-',
};

export const defaultHeaders = {
  'apikey': ANON_KEY,
  'Authorization': `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
};

// Fast pseudo-random UUID generator for k6 JavaScript runtime
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
