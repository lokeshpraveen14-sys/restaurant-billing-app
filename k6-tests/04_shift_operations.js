import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, defaultHeaders, TEST_TAGS, generateUUID } from './config.js';

export const options = {
  scenarios: {
    shift_lifecycle: {
      executor: 'per-vu-iterations',
      vus: 4,
      iterations: 3,
      maxDuration: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<850', 'p(99)<1500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const shiftId = generateUUID();

  // 1. Open Shift
  const openPayload = {
    id: shiftId,
    staff_name: TEST_TAGS.staff_name,
    staff_id: TEST_TAGS.staff_id,
    opened_at: new Date().toISOString(),
    opening_balance: 1000,
    status: 'open',
    total_cash: 0,
    total_upi: 0,
    total_card: 0,
    total_revenue: 0,
    total_orders: 0,
    total_covers: 0,
  };

  const openRes = http.post(
    `${BASE_URL}/rest/v1/shifts`,
    JSON.stringify(openPayload),
    { headers: defaultHeaders }
  );

  check(openRes, {
    'shift opened (201/200/204)': (r) => r.status === 201 || r.status === 200 || r.status === 204,
  });

  // 2. Add 2 bills to this shift
  for (let i = 0; i < 2; i++) {
    const billId = generateUUID();
    const invoiceNum = `${TEST_TAGS.invoice_prefix}SFT-${shiftId.substring(0, 8)}-${i}`;
    const billPayload = {
      id: billId,
      invoice_number: invoiceNum,
      shift_id: shiftId,
      staff_name: TEST_TAGS.staff_name,
      staff_id: TEST_TAGS.staff_id,
      customer_name: TEST_TAGS.customer_name,
      total_amount: 500,
      subtotal: 476.19,
      total_gst: 23.81,
      cgst_amount: 11.90,
      sgst_amount: 11.91,
      status: 'paid',
      payments: [{ method: 'cash', amount: 500 }],
    };

    const billRes = http.post(
      `${BASE_URL}/rest/v1/bills`,
      JSON.stringify(billPayload),
      { headers: defaultHeaders }
    );

    check(billRes, {
      'shift bill created': (r) => r.status === 201 || r.status === 200 || r.status === 204,
    });
  }

  // 3. Query all bills for this shift (simulate cashier Shift Management view)
  const shiftBillsRes = http.get(
    `${BASE_URL}/rest/v1/bills?shift_id=eq.${shiftId}&select=id,total_amount,payments,status`,
    { headers: defaultHeaders }
  );

  check(shiftBillsRes, {
    'shift bills fetched': (r) => r.status === 200,
  });

  // 4. Close Shift with reconciled balance
  const closeRes = http.patch(
    `${BASE_URL}/rest/v1/shifts?id=eq.${shiftId}`,
    JSON.stringify({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closing_balance: 2000,
      total_cash: 1000,
      total_revenue: 1000,
      total_orders: 2,
    }),
    { headers: defaultHeaders }
  );

  check(closeRes, {
    'shift closed successfully': (r) => r.status === 200 || r.status === 204,
  });

  sleep(0.5);
}
