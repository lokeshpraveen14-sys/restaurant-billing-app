import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, defaultHeaders, TEST_TAGS, generateUUID } from './config.js';

export const options = {
  scenarios: {
    cashier_peak_billing: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '5s', target: 3 },   // Ramp up to 3 cashiers
        { duration: '15s', target: 6 },  // Peak 6 simultaneous cashiers billing
        { duration: '5s', target: 0 },   // Cool down
      ],
      gracefulRampDown: '2s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1500'], // 95% under 1.5s across internet to cloud DB
    http_req_failed: ['rate<0.01'],    // < 1% error rate
  },
};

export default function () {
  const billId = generateUUID();
  const invoiceNum = `${TEST_TAGS.invoice_prefix}${Date.now()}-${__VU}-${__ITER}`;

  const billPayload = {
    id: billId,
    invoice_number: invoiceNum,
    order_type: __ITER % 2 === 0 ? 'dine-in' : 'takeaway',
    table_number: TEST_TAGS.table_number,
    guest_count: 2,
    subtotal: 350.00,
    total_gst: 17.50,
    cgst_amount: 8.75,
    sgst_amount: 8.75,
    igst_amount: 0,
    service_charge: 0,
    discount_amount: 0,
    total_amount: 367.50,
    status: 'paid',
    staff_name: TEST_TAGS.staff_name,
    staff_id: TEST_TAGS.staff_id,
    customer_name: TEST_TAGS.customer_name,
    customer_phone: TEST_TAGS.customer_phone,
    is_gst_bill: true,
    items: [
      { id: generateUUID(), name: 'Special Chicken Biryani', price: 250, quantity: 1, taxRate: 5, total: 250 },
      { id: generateUUID(), name: 'Butter Roti', price: 50, quantity: 2, taxRate: 5, total: 100 }
    ],
    payments: [
      { method: 'cash', amount: 200 },
      { method: 'upi', amount: 167.50, reference: 'UPI-TEST-REF' }
    ]
  };

  const res = http.post(
    `${BASE_URL}/rest/v1/bills`,
    JSON.stringify(billPayload),
    { headers: defaultHeaders }
  );

  check(res, {
    'bill created successfully (201/200/204)': (r) => r.status === 201 || r.status === 200 || r.status === 204,
  });

  sleep(0.4 + Math.random() * 0.4);
}
