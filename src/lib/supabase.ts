import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://czflketsnfyicpnfjfrb.supabase.co';
const supabaseKey = 'sb_publishable_cLKyR5xgBQtajm4HfPHwgw_WBcFxx2F';

// Custom fetch with keepalive + 20s timeout to reduce TCP setup overhead on each request
const customFetch = (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  return fetch(url, {
    ...options,
    keepalive: true,
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
