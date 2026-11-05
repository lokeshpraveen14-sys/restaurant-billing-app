import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://czflketsnfyicpnfjfrb.supabase.co';
const supabaseKey = 'sb_publishable_cLKyR5xgBQtajm4HfPHwgw_WBcFxx2F';

// Custom fetch with 20s timeout (without keepalive flag to avoid 64KB browser body limits)
const customFetch = (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  if (options?.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }
  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { fetch: customFetch },
  realtime: {
    heartbeatIntervalMs: 15000,
    reconnectAfterMs: (tries: number) => Math.min(1000 * Math.pow(2, tries), 10000),
  },
});
