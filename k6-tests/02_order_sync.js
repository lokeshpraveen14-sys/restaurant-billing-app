import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, defaultHeaders, TEST_TAGS, generateUUID } from './config.js';

export const options = {
  scenarios: {
    waiter_order_bursts: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '5s', target: 3 },   // Ramp up to 3 waiters
        { duration: '15s', target: 6 },  // 6 concurrent waiter order sessions
        { duration: '5s', target: 0 },   // Ramp down
      ],
      gracefulRampDown: '2s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const orderId = generateUUID();
  const initialItems = [
    { id: generateUUID(), name: 'Paneer Butter Masala', price: 220, quantity: 1, status: 'pending' },
    { id: generateUUID(), name: 'Garlic Naan', price: 60, quantity: 2, status: 'pending' }
  ];

  // 1. Create Order
  const createPayload = {
    id: orderId,
    table_number: TEST_TAGS.table_number,
    order_type: 'dine-in',
    status: 'open',
    guest_count: 3,
    staff_name: TEST_TAGS.staff_name,
    staff_id: TEST_TAGS.staff_id,
    items: initialItems,
    kot_printed: false,
    notes: 'K6 load test order'
  };

  const createRes = http.post(
    `${BASE_URL}/rest/v1/orders`,
    JSON.stringify(createPayload),
    { headers: defaultHeaders }
  );

  check(createRes, {
    'order created (201/200/204)': (r) => r.status === 201 || r.status === 200 || r.status === 204,
  });

  sleep(0.3);

  // 2. Add extra items (Waiter adds drinks)
  const updatedItems = [
    ...initialItems,
    { id: generateUUID(), name: 'Sweet Lassi', price: 70, quantity: 2, status: 'pending' }
  ];

  const patchRes = http.patch(
    `${BASE_URL}/rest/v1/orders?id=eq.${orderId}`,
    JSON.stringify({
      items: updatedItems,
      kot_printed: true,
      kot_printed_at: new Date().toISOString()
    }),
    { headers: defaultHeaders }
  );

  check(patchRes, {
    'order items patched (200/204)': (r) => r.status === 200 || r.status === 204,
  });

  sleep(0.4 + Math.random() * 0.4);
}
