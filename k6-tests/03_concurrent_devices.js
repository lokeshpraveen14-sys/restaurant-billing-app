import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, defaultHeaders } from './config.js';

export const options = {
  scenarios: {
    multi_device_sync_reads: {
      executor: 'ramping-vus',
      startVUs: 2,
      stages: [
        { duration: '5s', target: 5 },   // 5 devices
        { duration: '15s', target: 12 }, // 12 simultaneous devices polling/syncing
        { duration: '5s', target: 0 },   // Cool down
      ],
      gracefulRampDown: '2s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1200'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  // 1. Fetch recent 50 bills (standard TopBar & Reports view over 60,000+ bills)
  const billsRes = http.get(
    `${BASE_URL}/rest/v1/bills?select=id,invoice_number,total_amount,status,created_at&order=created_at.desc&limit=50`,
    { headers: defaultHeaders }
  );

  check(billsRes, {
    'bills query status 200': (r) => r.status === 200,
  });

  // 2. Fetch table status (Table Grid view)
  const tablesRes = http.get(
    `${BASE_URL}/rest/v1/restaurant_tables?select=id,table_number,status,capacity,occupied_since`,
    { headers: defaultHeaders }
  );

  check(tablesRes, {
    'tables query status 200': (r) => r.status === 200,
  });

  // 3. Fetch active open orders
  const ordersRes = http.get(
    `${BASE_URL}/rest/v1/orders?select=id,table_number,status,items,updated_at&status=eq.open`,
    { headers: defaultHeaders }
  );

  check(ordersRes, {
    'orders query status 200': (r) => r.status === 200,
  });

  // 4. Fetch menu items catalog
  const menuRes = http.get(
    `${BASE_URL}/rest/v1/menu_items?select=id,name,base_price,available&limit=100`,
    { headers: defaultHeaders }
  );

  check(menuRes, {
    'menu query status 200': (r) => r.status === 200,
  });

  sleep(0.5 + Math.random() * 0.5);
}
