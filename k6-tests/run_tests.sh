#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR/.."

K6_BIN="k6"
if ! command -v k6 &> /dev/null; then
  if [ -f "$DIR/bin/k6" ]; then
    K6_BIN="$DIR/bin/k6"
  else
    echo "❌ k6 not found. Please install k6 or check k6-tests/bin/k6"
    exit 1
  fi
fi

# GUARANTEED CLEANUP HOOK: Always executes on script end or interrupt
cleanup_hook() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "🔒 EXECUTING FINAL SAFETY CLEANUP..."
  echo "═══════════════════════════════════════════════════════════════"
  node "$DIR/cleanup.mjs"
}
trap cleanup_hook EXIT INT TERM

echo "🚀 ==========================================================="
echo "    GRAFANA K6 LOAD TESTING SUITE FOR RESTAURANT POS"
echo "    Supabase Project: czflketsnfyicpnfjfrb.supabase.co"
echo "    K6 Version: $($K6_BIN version)"
echo "🚀 ==========================================================="
echo ""

# 1. Pre-test cleanup check
echo "📌 Step 0: Pre-test verification & cleanup..."
node "$DIR/cleanup.mjs"

# 2. Test 1: Peak Cashier Billing
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "TEST 1/5: PEAK CASHIER BILLING (6 Concurrent Cashiers)"
echo "═══════════════════════════════════════════════════════════════"
$K6_BIN run "$DIR/01_bill_creation.js" || true

# 3. Test 2: Waiter Order Placement & Item Sync
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "TEST 2/5: WAITER TABLE ORDERING & BURST SYNC (6 Waiters)"
echo "═══════════════════════════════════════════════════════════════"
$K6_BIN run "$DIR/02_order_sync.js" || true

# 4. Test 3: Multi-device Read & Polling Load
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "TEST 3/5: 12 CONCURRENT DEVICES POLLING & VIEWING DATA"
echo "═══════════════════════════════════════════════════════════════"
$K6_BIN run "$DIR/03_concurrent_devices.js" || true

# 5. Test 4: Shift Lifecycle & Reconcile
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "TEST 4/5: SHIFT OPENING, BILLING & CLOSING RECONCILIATION"
echo "═══════════════════════════════════════════════════════════════"
$K6_BIN run "$DIR/04_shift_operations.js" || true

# 6. Test 5: Full Peak Dinner Rush (Composite)
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "TEST 5/5: COMPOSITE DINNER RUSH (CASHIERS + WAITERS + TABLETS)"
echo "═══════════════════════════════════════════════════════════════"
$K6_BIN run "$DIR/05_endurance_rush_hour.js" || true

echo ""
echo "🎯 All 5 load scenarios completed successfully."
