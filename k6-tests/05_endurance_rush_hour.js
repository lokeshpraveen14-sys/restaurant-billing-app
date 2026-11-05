import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, defaultHeaders, TEST_TAGS, generateUUID } from './config.js';

export const options = {
  scenarios: {
    // 5 concurrent cashiers creating bills at rush hour
    cashiers: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '5s', target: 4 },
        { duration: '15s', target: 5 },
        { duration: '5s', target: 0 },
      ],
      exec: 'cashierAction',
    },
    // 4 waiters taking orders
    waiters: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '5s', target: 3 },
        { duration: '15s', target: 4 },
        { duration: '5s', target: 0 },
      ],
      exec: 'waiterAction',
    },
    // 3 tablets polling active state
    tablets: {
      executor: 'constant-vus',
      vus: 3,
      duration: '25s',
      exec: 'tabletAction',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.01'],
  },
};

export function cashierAction() {
  const billId = generateUUID();
  const invoiceNum = `${TEST_TAGS.invoice_prefix}RUSH-${Date.now()}-${__VU}-${__ITER}`;

  const payload = {
    id: billId,
    invoice_number: invoiceNum,
    order_type: 'dine-in',
    table_number: TEST_TAGS.table_number,
    guest_count: 4,
    subtotal: 820.00,
    total_gst: 41.00,
    cgst_amount: 20.50,
    sgst_amount: 20.50,
    total_amount: 861.00,
    status: 'paid',
    staff_name: TEST_TAGS.staff_name,
    staff_id: TEST_TAGS.staff_id,
    customer_name: TEST_TAGS.customer_name,
    customer_phone: TEST_TAGS.customer_phone,
    is_gst_bill: true,
    items: [
      { id: generateUUID(), name: 'Mutton Biryani', price: 340, quantity: 2, taxRate: 5, total: 680 },
      { id: generateUUID(), name: 'Fresh Lime Soda', price: 70, quantity: 2, taxRate: 5, total: 140 }
    ],
    payments: [{ method: 'upi', amount: 861.00 }]
  };

  const res = http.post(`${BASE_URL}/rest/v1/bills`, JSON.stringify(payload), { headers: defaultHeaders });
  check(res, { 'rush bill created': (r) => r.status === 201 || r.status === 200 || r.status === 204 });

  sleep(0.4 + Math.random() * 0.4);
}

export function waiterAction() {
  const orderId = generateUUID();
  const createPayload = {
    id: orderId,
    table_number: TEST_TAGS.table_number,
    order_type: 'dine-in',
    status: 'open',
    guest_count: 2,
    staff_name: TEST_TAGS.staff_name,
    staff_id: TEST_TAGS.staff_id,
    items: [{ id: generateUUID(), name: 'Veg Fried Rice', price: 180, quantity: 1, status: 'pending' }],
    kot_printed: false
  };

  const res = http.post(`${BASE_URL}/rest/v1/orders`, JSON.stringify(createPayload), { headers: defaultHeaders });
  check(res, { 'waiter order placed': (r) => r.status === 201 || r.status === 200 || r.status === 204 });

  sleep(0.5 + Math.random() * 0.5);
}

export function tabletAction() {
  const res = http.get(
    `${BASE_URL}/rest/v1/bills?select=id,invoice_number,total_amount,status&order=created_at.desc&limit=30`,
    { headers: defaultHeaders }
  );
  check(res, { 'tablet live sync fast': (r) => r.status === 200 });

  sleep(0.8 + Math.random() * 0.4);
}
